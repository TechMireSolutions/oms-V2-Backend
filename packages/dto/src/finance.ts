import { z } from "zod";
import { UuidSchema } from "./common";

// Money as a string to avoid float drift over the wire; parsed to Decimal server-side.
const MoneySchema = z.string().regex(/^\d{1,14}(\.\d{1,4})?$/, "invalid money amount");

// ── Journal entry (maker step) ────────────────────────────────────────────
export const JournalLineInputSchema = z.object({
  accountId: UuidSchema,
  // Exactly one of debit/credit must be > 0 (refined below).
  debit: MoneySchema.default("0"),
  credit: MoneySchema.default("0"),
  lineMemo: z.string().max(500).optional()
});
export type JournalLineInput = z.infer<typeof JournalLineInputSchema>;

export const CreateJournalEntrySchema = z.object({
  periodId: UuidSchema,
  entryDate: z.string().date(),
  memo: z.string().max(1000).optional(),
  currency: z.string().length(3).default("PHP"),
  source: z.string().max(40).default("manual"),
  sourceRef: z.string().max(120).optional(),
  lines: z.array(JournalLineInputSchema).min(2)
}).superRefine((val, ctx) => {
  for (const [i, l] of val.lines.entries()) {
    const d = Number(l.debit), c = Number(l.credit);
    if ((d > 0) === (c > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lines", i],
        message: "Each line must have exactly one of debit or credit greater than zero"
      });
    }
  }
});
export type CreateJournalEntry = z.infer<typeof CreateJournalEntrySchema>;

export const ApproveJournalEntrySchema = z.object({
  // Optional acknowledgement note from the checker.
  note: z.string().max(500).optional()
});
export type ApproveJournalEntry = z.infer<typeof ApproveJournalEntrySchema>;

export const JournalStatusSchema = z.enum(["PENDING_APPROVAL", "POSTED", "REVERSED"]);

export const JournalEntryViewSchema = z.object({
  id: UuidSchema,
  entryNo: z.string(),
  periodId: UuidSchema,
  entryDate: z.string(),
  status: JournalStatusSchema,
  currency: z.string(),
  memo: z.string().nullable(),
  preparedById: UuidSchema,
  postedById: UuidSchema.nullable(),
  totalDebit: z.string(),
  totalCredit: z.string(),
  lines: z.array(z.object({
    accountId: UuidSchema,
    debit: z.string(),
    credit: z.string(),
    lineNo: z.number().int(),
    lineMemo: z.string().nullable()
  }))
});
export type JournalEntryView = z.infer<typeof JournalEntryViewSchema>;

// ── Trial balance ───────────────────────────────────────────────────────
export const TrialBalanceRowSchema = z.object({
  accountId: UuidSchema,
  accountCode: z.string(),
  accountName: z.string(),
  accountType: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]),
  debit: z.string(),
  credit: z.string()
});
export const TrialBalanceSchema = z.object({
  periodId: UuidSchema.optional(),
  asOf: z.string(),
  rows: z.array(TrialBalanceRowSchema),
  totalDebit: z.string(),
  totalCredit: z.string(),
  balanced: z.boolean()
});
export type TrialBalance = z.infer<typeof TrialBalanceSchema>;

// ── Invoice generation ──────────────────────────────────────────────────
export const GenerateInvoiceSchema = z.object({
  customerRef: z.string().min(1).max(120),
  periodId: UuidSchema,
  issuedOn: z.string().date(),
  dueOn: z.string().date().optional(),
  currency: z.string().length(3).default("PHP"),
  // Account to debit for receivables (AR control account).
  receivableAccountId: UuidSchema,
  // Required when any line carries tax — the tax liability is credited here.
  taxPayableAccountId: UuidSchema.optional(),
  lines: z.array(z.object({
    description: z.string().min(1).max(300),
    quantity: MoneySchema.default("1"),
    unitPrice: MoneySchema,
    taxAmount: MoneySchema.default("0"),
    revenueAccountId: UuidSchema
  })).min(1),
  // If true, also post the AR/revenue journal entry (as PENDING_APPROVAL).
  postJournal: z.boolean().default(true)
});
export type GenerateInvoice = z.infer<typeof GenerateInvoiceSchema>;

export const InvoiceViewSchema = z.object({
  id: UuidSchema,
  invoiceNo: z.string(),
  customerRef: z.string(),
  status: z.enum(["ISSUED", "PAID", "CANCELLED", "VOID"]),
  currency: z.string(),
  subtotal: z.string(),
  taxTotal: z.string(),
  total: z.string(),
  journalEntryId: UuidSchema.nullable()
});
export type InvoiceView = z.infer<typeof InvoiceViewSchema>;
