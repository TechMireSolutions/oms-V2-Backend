// Outbound port: Audit. Every AI request/response is logged (prompts/responses
// hashed or redacted) per Part F governance. Bound when Audit module is wired.
export const AUDIT_PORT = Symbol("AI_AUDIT_PORT");

export interface AuditPort {
  logEvent(input: {
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    context?: Record<string, unknown>;
  }): Promise<void>;
}
