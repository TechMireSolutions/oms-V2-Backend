// Outbound port: Audit. Every branding change is audited (Module 12 governance).
export const AUDIT_PORT = Symbol("BRANDING_AUDIT_PORT");

export interface AuditPort {
  logEvent(input: {
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
  }): Promise<void>;
}
