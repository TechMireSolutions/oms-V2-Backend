import {
  BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, Optional
} from "@nestjs/common";
import { getPrismaClient } from "@oms/db";
import type {
  AuthContext, CreateFieldDefinition, CreateFormDefinition,
  DefinitionView, TransitionRequest, ValidationResult
} from "@oms/dto";
import { IAM_CONTRACT, type IamContract } from "../../iam";
import { CUSTOMISATION_PERMISSIONS, type CustomisationContract } from "../contracts";
import { AUDIT_PORT, type AuditPort } from "../ports";
import { LockedCoreGuard } from "./locked-core";
import { nextStatus, isPublishing } from "./lifecycle";
import { ValidationService } from "./validation.service";

type Kind = "field" | "form";

@Injectable()
export class CustomizationService implements CustomisationContract {
  private readonly prisma = getPrismaClient();

  constructor(
    @Inject(IAM_CONTRACT) private readonly iam: IamContract,
    private readonly lockedCore: LockedCoreGuard,
    private readonly validation: ValidationService,
    @Optional() @Inject(AUDIT_PORT) private readonly audit?: AuditPort
  ) {}

  private async require(ctx: AuthContext, permission: string): Promise<void> {
    if (!(await this.iam.checkPermission(ctx, permission)))
      throw new ForbiddenException(`Missing permission: ${permission}`);
  }

  private async emitAudit(ctx: AuthContext, action: string, kind: Kind, id: string, before: unknown, after: unknown) {
    await this.audit?.logEvent({
      actorId: ctx.userId, action: `meta.${kind}.${action}`,
      entityType: kind === "field" ? "FieldDefinition" : "FormDefinition",
      entityId: id, before, after
    });
  }

  // ── Authoring (always creates a DRAFT, next version for the key) ──────
  async createFieldDefinition(ctx: AuthContext, input: CreateFieldDefinition): Promise<DefinitionView> {
    await this.require(ctx, CUSTOMISATION_PERMISSIONS.authorField);
    this.lockedCore.assertFieldAllowed(input);

    const version = await this.nextFieldVersion(input.entityType, input.key);
    const row = await this.prisma.fieldDefinition.create({
      data: {
        entityType: input.entityType, key: input.key, version, status: "DRAFT",
        label: input.label, fieldType: input.fieldType,
        config: JSON.stringify(input.config ?? {}),       // JSON stored as TEXT (SQLite)
        uiSchema: JSON.stringify(input.uiSchema ?? {}),
        required: input.required, readPermission: input.readPermission,
        writePermission: input.writePermission, createdById: ctx.userId
      }
    });
    await this.emitAudit(ctx, "create", "field", row.id, null, { key: row.key, version });
    return this.toView("field", row);
  }

  async createFormDefinition(ctx: AuthContext, input: CreateFormDefinition): Promise<DefinitionView> {
    await this.require(ctx, CUSTOMISATION_PERMISSIONS.authorForm);

    // Validation engine: every referenced field must exist (published or draft)
    // for this entity, else the form is incoherent.
    const referenced = [...new Set(input.sections.flatMap((s) => s.fields))];
    const known = await this.prisma.fieldDefinition.findMany({
      where: { entityType: input.entityType, key: { in: referenced } },
      select: { key: true }, distinct: ["key"]
    });
    const knownKeys = new Set(known.map((k) => k.key));
    const missing = referenced.filter((k) => !knownKeys.has(k));
    if (missing.length) throw new BadRequestException(`Form references unknown fields: ${missing.join(", ")}`);

    const version = await this.nextFormVersion(input.key);
    const row = await this.prisma.formDefinition.create({
      data: {
        entityType: input.entityType, key: input.key, version, status: "DRAFT",
        title: input.title, sections: JSON.stringify(input.sections ?? []),
        uiSchema: JSON.stringify(input.uiSchema ?? {}), createdById: ctx.userId
      }
    });
    await this.emitAudit(ctx, "create", "form", row.id, null, { key: row.key, version });
    return this.toView("form", row);
  }

  // ── Lifecycle transitions ─────────────────────────────────────────────
  async transitionField(ctx: AuthContext, id: string, req: TransitionRequest): Promise<DefinitionView> {
    return this.transition("field", ctx, id, req);
  }
  async transitionForm(ctx: AuthContext, id: string, req: TransitionRequest): Promise<DefinitionView> {
    return this.transition("form", ctx, id, req);
  }

  private async transition(kind: Kind, ctx: AuthContext, id: string, req: TransitionRequest): Promise<DefinitionView> {
    // Publish/rollback need the elevated publish permission; preview/archive
    // only need authoring rights.
    await this.require(ctx, isPublishing(req.action)
      ? CUSTOMISATION_PERMISSIONS.publish
      : (kind === "field" ? CUSTOMISATION_PERMISSIONS.authorField : CUSTOMISATION_PERMISSIONS.authorForm));

    const result = await this.prisma.$transaction(async (tx) => {
      const delegate: any = kind === "field" ? tx.fieldDefinition : tx.formDefinition;

      // For ROLLBACK we re-publish a PRIOR version, not `id`.
      const subjectId = req.action === "ROLLBACK" ? (req.targetVersionId ?? id) : id;
      const current = await delegate.findUnique({ where: { id: subjectId } });
      if (!current) throw new NotFoundException("Definition not found");

      const target = nextStatus(current.status, req.action);

      // Publishing supersedes the existing PUBLISHED version of the same key.
      if (target === "PUBLISHED") {
        const where = kind === "field"
          ? { entityType: current.entityType, key: current.key, status: "PUBLISHED" }
          : { key: current.key, status: "PUBLISHED" };
        await delegate.updateMany({ where, data: { status: "SUPERSEDED" } });
      }

      const updated = await delegate.update({
        where: { id: subjectId },
        data: {
          status: target,
          ...(target === "PUBLISHED" ? { publishedAt: new Date() } : {}),
          ...(target === "ARCHIVED" ? { archivedAt: new Date() } : {})
        }
      });
      return { before: current, after: updated };
    });

    await this.emitAudit(ctx, req.action.toLowerCase(), kind, result.after.id,
      { status: result.before.status }, { status: result.after.status, note: req.note });
    return this.toView(kind, result.after);
  }

  // ── Runtime validation (delegated) ────────────────────────────────────
  async validateCustomData(
    ctx: AuthContext, entityType: string, formKey: string, input: Record<string, unknown>
  ): Promise<ValidationResult> {
    return this.validation.validate(ctx, entityType, formKey, input);
  }

  async getPublishedForm(ctx: AuthContext, formKey: string): Promise<unknown> {
    await this.require(ctx, CUSTOMISATION_PERMISSIONS.read);
    const form = await this.prisma.formDefinition.findFirst({ where: { key: formKey, status: "PUBLISHED" } });
    if (!form) throw new NotFoundException(`No published form '${formKey}'`);
    const sections = parseJson<Array<{ fields: string[] }>>(form.sections, []);
    const keys = sections.flatMap((s) => s.fields);
    const fields = await this.prisma.fieldDefinition.findMany({
      where: { entityType: form.entityType, key: { in: keys }, status: "PUBLISHED" }
    });
    // Parse JSON-string columns back into objects for the renderer.
    return {
      form: { ...form, sections, uiSchema: parseJson(form.uiSchema, {}) },
      fields: fields.map((f) => ({
        ...f, config: parseJson(f.config, {}), uiSchema: parseJson(f.uiSchema, {})
      }))
    };
  }

  // ── helpers ───────────────────────────────────────────────────────────
  private async nextFieldVersion(entityType: string, key: string): Promise<number> {
    const max = await this.prisma.fieldDefinition.aggregate({
      where: { entityType, key }, _max: { version: true }
    });
    return (max._max.version ?? 0) + 1;
  }
  private async nextFormVersion(key: string): Promise<number> {
    const max = await this.prisma.formDefinition.aggregate({ where: { key }, _max: { version: true } });
    return (max._max.version ?? 0) + 1;
  }

  private toView(kind: Kind, row: any): DefinitionView {
    return {
      id: row.id, kind, entityType: row.entityType, key: row.key, version: row.version,
      status: row.status, publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null
    };
  }
}

// Parse a JSON-string column (SQLite stores JSON as TEXT) with a fallback.
function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string") return (raw as T) ?? fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}
