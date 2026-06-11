// Outbound port: the Audit module. Every definition change MUST be logged
// immutably (Part M governance). Bound to the real Audit contract when that
// module is wired; @Optional() until then.
export const AUDIT_PORT = Symbol("CUSTOMISATION_AUDIT_PORT");

export interface AuditPort {
  logEvent(input: {
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
    context?: Record<string, unknown>;
  }): Promise<void>;
}
