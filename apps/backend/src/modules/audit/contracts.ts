// Audit & Logging (Module 7) — public contract. Append-only event store.
export const AUDIT_CONTRACT = Symbol("AUDIT_CONTRACT");

export interface AuditLogInput {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  context?: Record<string, unknown>;
}

export interface AuditEventView {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  context: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditContract {
  logEvent(input: AuditLogInput): Promise<void>;
  history(entityType: string, entityId: string): Promise<AuditEventView[]>;
  search(opts: { action?: string; actorId?: string; limit?: number }): Promise<AuditEventView[]>;
}

export const AUDIT_PERMISSIONS = { read: "audit.read" } as const;
