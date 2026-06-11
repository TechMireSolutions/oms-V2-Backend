import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import { getPrismaClient } from "@oms/db";
import { FieldConfigSchema, type AuthContext, type FieldConfig, type ValidationResult } from "@oms/dto";
import { IAM_CONTRACT, type IamContract } from "../../iam";
import { buildFieldSchema, isVisible, type CompiledField } from "./schema-builder";

/**
 * Server-side validation of runtime user input against PUBLISHED definitions,
 * producing a sanitised object safe to store in an entity's custom_data JSONB.
 *
 * Guarantees:
 *  - Only fields declared in the published form are accepted (unknown keys dropped).
 *  - Each value matches its FieldDefinition (type + validation rules).
 *  - Conditionally-hidden fields are skipped.
 *  - A field the caller lacks `writePermission` for is rejected if supplied.
 */
@Injectable()
export class ValidationService {
  private readonly prisma = getPrismaClient();

  constructor(@Inject(IAM_CONTRACT) private readonly iam: IamContract) {}

  async loadPublishedFields(entityType: string, formKey: string): Promise<{ form: any; fields: CompiledField[] }> {
    const form = await this.prisma.formDefinition.findFirst({
      where: { key: formKey, entityType, status: "PUBLISHED" }
    });
    if (!form) throw new NotFoundException(`No published form '${formKey}' for ${entityType}`);

    // sections is stored as a JSON string (SQLite).
    const sections = parseJson<Array<{ fields: string[] }>>(form.sections, []);
    const keys = sections.flatMap((s) => s.fields);
    const defs = await this.prisma.fieldDefinition.findMany({
      where: { entityType, key: { in: keys }, status: "PUBLISHED" }
    });

    const fields: CompiledField[] = defs.map((d) => ({
      key: d.key,
      fieldType: d.fieldType as CompiledField["fieldType"],
      required: d.required,
      config: parseConfig(d.config),
      writePermission: d.writePermission
    }));
    return { form, fields };
  }

  async validate(
    ctx: AuthContext,
    entityType: string,
    formKey: string,
    input: Record<string, unknown>
  ): Promise<ValidationResult> {
    const { fields } = await this.loadPublishedFields(entityType, formKey);
    const errors: { path: string; message: string }[] = [];

    // 1) Field-level write-permission gate: reject any supplied field the
    //    caller may not write.
    for (const f of fields) {
      if (input[f.key] !== undefined && f.writePermission) {
        const allowed = await this.iam.checkPermission(ctx, f.writePermission);
        if (!allowed) errors.push({ path: f.key, message: `No permission to write field '${f.key}'` });
      }
    }

    // 2) Build a Zod object schema from visible fields only.
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const f of fields) {
      if (!isVisible(f, input)) continue;
      shape[f.key] = buildFieldSchema(f);
    }
    // `.strip()` drops unknown keys — input can never inject undeclared columns.
    const schema = z.object(shape).strip();

    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        errors.push({ path: issue.path.join("."), message: issue.message });
    }

    if (errors.length) return { valid: false, errors };

    // Apply declared defaults for omitted, visible fields.
    const data: Record<string, unknown> = { ...(parsed.success ? parsed.data : {}) };
    for (const f of fields) {
      if (isVisible(f, input) && data[f.key] === undefined && f.config.default !== undefined)
        data[f.key] = f.config.default;
    }
    return { valid: true, data };
  }
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string") return (raw as T) ?? fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

// config is stored as a JSON string column (SQLite) — parse, then validate.
function parseConfig(raw: unknown): FieldConfig {
  const obj = parseJson<unknown>(raw, {});
  const parsed = FieldConfigSchema.safeParse(obj ?? {});
  return parsed.success ? parsed.data : {};
}
