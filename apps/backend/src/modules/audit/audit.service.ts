import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { getPrismaClient } from "@oms/db";
import { type AuditContract, type AuditEventView, type AuditLogInput } from "./contracts";

@Injectable()
export class AuditService implements AuditContract {
  private readonly prisma = getPrismaClient();

  private hash(v: unknown): string | null {
    if (v === undefined || v === null) return null;
    return createHash("sha256").update(JSON.stringify(v)).digest("hex");
  }

  async logEvent(input: AuditLogInput): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        beforeHash: this.hash(input.before),
        afterHash: this.hash(input.after),
        context: input.context ? JSON.stringify(input.context) : null
      }
    });
  }

  async history(entityType: string, entityId: string): Promise<AuditEventView[]> {
    const rows = await this.prisma.auditEvent.findMany({
      where: { entityType, entityId }, orderBy: { createdAt: "desc" }, take: 200
    });
    return rows.map(this.toView);
  }

  async search(opts: { action?: string; actorId?: string; limit?: number }): Promise<AuditEventView[]> {
    const rows = await this.prisma.auditEvent.findMany({
      where: { ...(opts.action ? { action: opts.action } : {}), ...(opts.actorId ? { actorId: opts.actorId } : {}) },
      orderBy: { createdAt: "desc" }, take: Math.min(opts.limit ?? 100, 500)
    });
    return rows.map(this.toView);
  }

  private toView(r: any): AuditEventView {
    return {
      id: r.id, actorId: r.actorId, action: r.action, entityType: r.entityType, entityId: r.entityId,
      context: r.context ? safe(r.context) : null, createdAt: r.createdAt.toISOString()
    };
  }
}

function safe(s: string): Record<string, unknown> | null {
  try { return JSON.parse(s); } catch { return null; }
}
