// Outbound ports — what Admissions & Welfare NEEDS from sibling modules.
// These are bound to the real Finance / Notification / Audit module contracts
// when those modules are wired into AppModule. Until then they are @Optional()
// so the module runs standalone. This is the dependency-inversion edge of the
// modular monolith: Admissions depends on an interface it owns, not on another
// module's internals.
import type { AuthContext } from "@oms/dto";

export const FINANCE_PORT = Symbol("ADMISSIONS_FINANCE_PORT");
export const NOTIFICATION_PORT = Symbol("ADMISSIONS_NOTIFICATION_PORT");
export const AUDIT_PORT = Symbol("ADMISSIONS_AUDIT_PORT");

export interface FinancePort {
  // Triggered on welfare approval: post a subsidy / fee-waiver journal entry.
  postWelfareSubsidy(ctx: AuthContext, input: {
    welfareRequestId: string;
    type: string;
    amount: number;
    beneficiaryApplicantId: string;
  }): Promise<{ journalEntryId: string }>;
}

export interface NotificationPort {
  notify(ctx: AuthContext, input: {
    template: string;
    toUserId?: string;
    toEmail?: string;
    data: Record<string, unknown>;
  }): Promise<void>;
}

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
