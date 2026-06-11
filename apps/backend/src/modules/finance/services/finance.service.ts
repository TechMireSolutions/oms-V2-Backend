import {
  BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException
} from "@nestjs/common";
import { Decimal, getPrismaClient } from "@oms/db";
import type {
  AuthContext, ApproveJournalEntry, CreateJournalEntry, GenerateInvoice,
  InvoiceView, JournalEntryView, TrialBalance
} from "@oms/dto";
import { IAM_CONTRACT, type IamContract } from "../../iam";
import { FINANCE_PERMISSIONS, type FinanceContract } from "../contracts";
import { LedgerService } from "./ledger.service";

const ZERO = new Decimal(0);

@Injectable()
export class FinanceService implements FinanceContract {
  private readonly prisma = getPrismaClient();

  constructor(
    @Inject(IAM_CONTRACT) private readonly iam: IamContract,
    private readonly ledger: LedgerService
  ) {}

  private async require(ctx: AuthContext, permission: string): Promise<void> {
    if (!(await this.iam.checkPermission(ctx, permission)))
      throw new ForbiddenException(`Missing permission: ${permission}`);
  }

  // ── POST /finance/journal-entry (maker) ───────────────────────────────
  async createJournalEntry(ctx: AuthContext, input: CreateJournalEntry): Promise<JournalEntryView> {
    await this.require(ctx, FINANCE_PERMISSIONS.prepare);
    const id = await this.ledger.createPendingEntry(ctx, input, {
      source: input.source, sourceRef: input.sourceRef
    });
    return this.getEntryView(id);
  }

  // ── POST /finance/journal-entry/:id/approve (checker) ─────────────────
  async approveJournalEntry(ctx: AuthContext, id: string, _input: ApproveJournalEntry): Promise<JournalEntryView> {
    await this.require(ctx, FINANCE_PERMISSIONS.post);
    await this.ledger.postEntry(ctx, id); // enforces preparer != poster
    return this.getEntryView(id);
  }

  // ── POST /finance/journal-entry/:id/reverse ───────────────────────────
  async reverseJournalEntry(ctx: AuthContext, id: string, reason: string): Promise<JournalEntryView> {
    await this.require(ctx, FINANCE_PERMISSIONS.reverse);
    const reversalId = await this.ledger.reverseEntry(ctx, id, reason);
    return this.getEntryView(reversalId);
  }

  // ── GET /finance/trial-balance ────────────────────────────────────────
  async getTrialBalance(ctx: AuthContext, opts: { periodId?: string; asOf?: string }): Promise<TrialBalance> {
    await this.require(ctx, FINANCE_PERMISSIONS.trialBalance);

    const asOfDate = opts.asOf ? new Date(opts.asOf) : new Date();
    const grouped = await this.prisma.journalLine.groupBy({
      by: ["accountId"],
      where: {
        entry: {
          status: "POSTED",
          ...(opts.periodId ? { periodId: opts.periodId } : {}),
          entryDate: { lte: asOfDate }
        }
      },
      _sum: { debit: true, credit: true }
    });

    const accountIds = grouped.map((g) => g.accountId);
    const accounts = await this.prisma.account.findMany({ where: { id: { in: accountIds } } });
    const byId = new Map(accounts.map((a) => [a.id, a]));

    let totalDebit = ZERO;
    let totalCredit = ZERO;
    const rows = grouped.map((g) => {
      const acct = byId.get(g.accountId)!;
      const sumDebit = new Decimal(g._sum.debit ?? 0);
      const sumCredit = new Decimal(g._sum.credit ?? 0);
      // Net per account into a single column (conventional trial balance).
      const net = sumDebit.minus(sumCredit);
      const debit = net.greaterThan(0) ? net : ZERO;
      const credit = net.lessThan(0) ? net.abs() : ZERO;
      totalDebit = totalDebit.plus(debit);
      totalCredit = totalCredit.plus(credit);
      return {
        accountId: g.accountId,
        accountCode: acct.code,
        accountName: acct.name,
        accountType: acct.type as TrialBalance["rows"][number]["accountType"],
        debit: debit.toFixed(4),
        credit: credit.toFixed(4)
      };
    });

    rows.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
    return {
      periodId: opts.periodId,
      asOf: asOfDate.toISOString(),
      rows,
      totalDebit: totalDebit.toFixed(4),
      totalCredit: totalCredit.toFixed(4),
      balanced: totalDebit.equals(totalCredit)
    };
  }

  // ── POST /finance/invoices/generate ───────────────────────────────────
  async generateInvoice(ctx: AuthContext, input: GenerateInvoice): Promise<InvoiceView> {
    await this.require(ctx, FINANCE_PERMISSIONS.invoice);

    let subtotal = ZERO;
    let taxTotal = ZERO;
    const computed = input.lines.map((l) => {
      const qty = new Decimal(l.quantity ?? "1");
      const unit = new Decimal(l.unitPrice);
      const tax = new Decimal(l.taxAmount ?? "0");
      const lineTotal = qty.times(unit);
      subtotal = subtotal.plus(lineTotal);
      taxTotal = taxTotal.plus(tax);
      return { ...l, qty, unit, tax, lineTotal };
    });
    const total = subtotal.plus(taxTotal);
    if (taxTotal.greaterThan(0) && !input.taxPayableAccountId)
      throw new BadRequestException("taxPayableAccountId is required when lines carry tax");

    const result = await this.prisma.$transaction(async (tx) => {
      const year = new Date(input.issuedOn).getUTCFullYear();
      const seq = await tx.invoice.count({ where: { invoiceNo: { startsWith: `INV-${year}-` } } });
      const invoiceNo = `INV-${year}-${String(seq + 1).padStart(6, "0")}`;

      const invoice = await tx.invoice.create({
        data: {
          invoiceNo,
          customerRef: input.customerRef,
          status: "ISSUED",
          currency: input.currency,
          subtotal,
          taxTotal,
          total,
          issuedOn: new Date(input.issuedOn),
          dueOn: input.dueOn ? new Date(input.dueOn) : null,
          createdById: ctx.userId,
          lines: {
            create: computed.map((c) => ({
              description: c.description,
              quantity: c.qty,
              unitPrice: c.unit,
              lineTotal: c.lineTotal,
              revenueAccountId: c.revenueAccountId
            }))
          }
        }
      });
      return invoice;
    });

    // Optionally post the AR/revenue journal entry (as PENDING_APPROVAL — still
    // subject to maker-checker before it hits the ledger).
    let journalEntryId: string | null = null;
    if (input.postJournal) {
      const lines: CreateJournalEntry["lines"] = [
        { accountId: input.receivableAccountId, debit: total.toFixed(4), credit: "0" },
        ...computed.map((c) => ({
          accountId: c.revenueAccountId, debit: "0", credit: c.lineTotal.toFixed(4)
        }))
      ];
      if (taxTotal.greaterThan(0)) {
        lines.push({ accountId: input.taxPayableAccountId!, debit: "0", credit: taxTotal.toFixed(4) });
      }
      journalEntryId = await this.ledger.createPendingEntry(
        ctx,
        {
          periodId: input.periodId, entryDate: input.issuedOn, currency: input.currency,
          memo: `Invoice ${result.invoiceNo}`, source: "invoice", sourceRef: result.id, lines
        } as CreateJournalEntry,
        { source: "invoice", sourceRef: result.id }
      );
      await this.prisma.invoice.update({ where: { id: result.id }, data: { journalEntryId } });
    }

    return {
      id: result.id, invoiceNo: result.invoiceNo, customerRef: result.customerRef,
      status: result.status as InvoiceView["status"], currency: result.currency,
      subtotal: subtotal.toFixed(4), taxTotal: taxTotal.toFixed(4), total: total.toFixed(4),
      journalEntryId
    };
  }

  // ── Inbound from Admissions & Welfare (welfare subsidy posting) ───────
  async postWelfareSubsidy(ctx: AuthContext, input: {
    welfareRequestId: string; type: string; amount: number; beneficiaryApplicantId: string;
  }): Promise<{ journalEntryId: string }> {
    // Mapping of welfare type → (expense account, funding/credit account) lives in
    // configuration; resolved here. Kept minimal: caller-supplied accounts would
    // come from a finance config lookup in a full build.
    const expense = await this.prisma.account.findFirst({ where: { code: "5200-WELFARE", isActive: true } });
    const funding = await this.prisma.account.findFirst({ where: { code: "2100-WELFARE-PAYABLE", isActive: true } });
    if (!expense || !funding)
      throw new NotFoundException("Welfare expense/funding accounts not configured");

    const period = await this.prisma.accountingPeriod.findFirst({ where: { status: "OPEN" }, orderBy: { startsOn: "desc" } });
    if (!period) throw new NotFoundException("No open accounting period");

    const amount = new Decimal(input.amount).toFixed(4);
    const id = await this.ledger.createPendingEntry(
      ctx,
      {
        periodId: period.id,
        entryDate: new Date().toISOString().slice(0, 10),
        currency: "PHP",
        memo: `Welfare ${input.type} for request ${input.welfareRequestId}`,
        source: "welfare", sourceRef: input.welfareRequestId,
        lines: [
          { accountId: expense.id, debit: amount, credit: "0" },
          { accountId: funding.id, debit: "0", credit: amount }
        ]
      } as CreateJournalEntry,
      { source: "welfare", sourceRef: input.welfareRequestId }
    );
    return { journalEntryId: id };
  }

  // ── view helper ───────────────────────────────────────────────────────
  private async getEntryView(id: string): Promise<JournalEntryView> {
    const e = await this.prisma.journalEntry.findUnique({ where: { id }, include: { lines: { orderBy: { lineNo: "asc" } } } });
    if (!e) throw new NotFoundException("Journal entry not found");
    const totalDebit = e.lines.reduce((s, l) => s.plus(l.debit), ZERO);
    const totalCredit = e.lines.reduce((s, l) => s.plus(l.credit), ZERO);
    return {
      id: e.id, entryNo: e.entryNo, periodId: e.periodId,
      entryDate: e.entryDate.toISOString().slice(0, 10),
      status: e.status as JournalEntryView["status"], currency: e.currency, memo: e.memo,
      preparedById: e.preparedById, postedById: e.postedById,
      totalDebit: totalDebit.toFixed(4), totalCredit: totalCredit.toFixed(4),
      lines: e.lines.map((l) => ({
        accountId: l.accountId, debit: new Decimal(l.debit).toFixed(4),
        credit: new Decimal(l.credit).toFixed(4), lineNo: l.lineNo, lineMemo: l.lineMemo
      }))
    };
  }
}
