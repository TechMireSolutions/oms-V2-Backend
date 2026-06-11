// Core Finance — public contract surface.
// Consumed by sibling modules ONLY through the barrel. Every method takes an
// AuthContext; the service re-checks permissions and enforces maker-checker.
import type {
  AuthContext, CreateJournalEntry, JournalEntryView,
  ApproveJournalEntry, GenerateInvoice, InvoiceView, TrialBalance
} from "@oms/dto";

export const FINANCE_CONTRACT = Symbol("FINANCE_CONTRACT");

export interface FinanceContract {
  // Maker step: validates Debits == Credits, creates a PENDING_APPROVAL entry.
  createJournalEntry(ctx: AuthContext, input: CreateJournalEntry): Promise<JournalEntryView>;
  // Checker step: enforces preparedById != postedById, marks POSTED.
  approveJournalEntry(ctx: AuthContext, id: string, input: ApproveJournalEntry): Promise<JournalEntryView>;
  // Corrections: append a balanced reversing entry (no mutation of the original).
  reverseJournalEntry(ctx: AuthContext, id: string, reason: string): Promise<JournalEntryView>;

  getTrialBalance(ctx: AuthContext, opts: { periodId?: string; asOf?: string }): Promise<TrialBalance>;
  generateInvoice(ctx: AuthContext, input: GenerateInvoice): Promise<InvoiceView>;

  // Inbound from Admissions & Welfare (binds to that module's FinancePort).
  postWelfareSubsidy(ctx: AuthContext, input: {
    welfareRequestId: string; type: string; amount: number; beneficiaryApplicantId: string;
  }): Promise<{ journalEntryId: string }>;
}

export const FINANCE_PERMISSIONS = {
  prepare:        "finance.journal.prepare",
  post:           "finance.journal.post",
  reverse:        "finance.journal.reverse",
  trialBalance:   "finance.trialbalance.read",
  invoice:        "finance.invoice.generate"
} as const;
