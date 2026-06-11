import {
  BadRequestException, ConflictException, ForbiddenException,
  Injectable, NotFoundException, UnprocessableEntityException
} from "@nestjs/common";
import { Decimal, getPrismaClient, type Prisma } from "@oms/db";
import type { AuthContext, CreateJournalEntry } from "@oms/dto";

const ZERO = new Decimal(0);

export interface PreparedLine {
  accountId: string;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  lineMemo?: string;
  lineNo: number;
}

/**
 * LedgerService — the transactional core of double-entry bookkeeping.
 *
 * It is the ONLY place journal entries are written. It guarantees the
 * fundamental invariant SUM(debit) == SUM(credit) on every entry, runs at
 * SERIALIZABLE isolation, and never mutates posted financial rows (corrections
 * are reversing entries). The append-only DB triggers are the backstop; this
 * service is the first line.
 */
@Injectable()
export class LedgerService {
  private readonly prisma = getPrismaClient();

  /** Validate + normalize input lines, asserting balance. Throws on imbalance. */
  prepareBalancedLines(lines: CreateJournalEntry["lines"]): PreparedLine[] {
    let totalDebit = ZERO;
    let totalCredit = ZERO;
    const prepared: PreparedLine[] = [];

    lines.forEach((l, idx) => {
      const debit = new Decimal(l.debit ?? "0");
      const credit = new Decimal(l.credit ?? "0");
      if (debit.isNegative() || credit.isNegative())
        throw new BadRequestException(`Line ${idx + 1}: amounts must be non-negative`);
      if (debit.greaterThan(0) === credit.greaterThan(0))
        throw new BadRequestException(`Line ${idx + 1}: exactly one of debit/credit must be > 0`);

      totalDebit = totalDebit.plus(debit);
      totalCredit = totalCredit.plus(credit);
      prepared.push({ accountId: l.accountId, debit, credit, lineMemo: l.lineMemo, lineNo: idx + 1 });
    });

    // THE invariant. Decimal equality — no float tolerance fudging.
    if (!totalDebit.equals(totalCredit)) {
      throw new UnprocessableEntityException(
        `Unbalanced entry: debits ${totalDebit.toFixed(4)} != credits ${totalCredit.toFixed(4)}`
      );
    }
    if (totalDebit.equals(ZERO))
      throw new UnprocessableEntityException("Entry total cannot be zero");

    return prepared;
  }

  /**
   * Create a PENDING_APPROVAL entry inside a serializable transaction.
   * Validates: period is OPEN, accounts exist + active + postable, and balance.
   * This is the maker step — `preparedById` is recorded; nothing is posted yet.
   */
  async createPendingEntry(
    ctx: AuthContext,
    input: CreateJournalEntry,
    meta: { source: string; sourceRef?: string }
  ): Promise<string> {
    const prepared = this.prepareBalancedLines(input.lines);

    return this.prisma.$transaction(async (tx) => {
      const period = await tx.accountingPeriod.findUnique({ where: { id: input.periodId } });
      if (!period) throw new NotFoundException("Accounting period not found");
      if (period.status !== "OPEN") throw new ConflictException("Accounting period is locked");

      const entryDate = new Date(input.entryDate);
      if (entryDate < period.startsOn || entryDate > period.endsOn)
        throw new BadRequestException("entryDate falls outside the accounting period");

      // All referenced accounts must exist, be active, and be postable (no headers).
      const ids = [...new Set(prepared.map((l) => l.accountId))];
      const accounts = await tx.account.findMany({ where: { id: { in: ids } } });
      if (accounts.length !== ids.length) throw new BadRequestException("Unknown account in lines");
      for (const a of accounts) {
        if (!a.isActive) throw new BadRequestException(`Account ${a.code} is inactive`);
        if (!a.isPostable) throw new BadRequestException(`Account ${a.code} is a header (non-postable)`);
      }

      const entryNo = await this.nextEntryNo(tx, entryDate.getUTCFullYear());
      const entry = await tx.journalEntry.create({
        data: {
          entryNo,
          periodId: input.periodId,
          entryDate,
          memo: input.memo,
          currency: input.currency,
          status: "PENDING_APPROVAL",
          preparedById: ctx.userId,
          source: meta.source,
          sourceRef: meta.sourceRef,
          lines: {
            create: prepared.map((l) => ({
              entryDate,
              accountId: l.accountId,
              debit: l.debit,
              credit: l.credit,
              lineMemo: l.lineMemo,
              lineNo: l.lineNo
            }))
          }
        }
      });
      return entry.id;
    }, { isolationLevel: "Serializable" });
  }

  /**
   * Checker step — enforce ABAC separation of duties, then mark POSTED.
   * The preparer can NEVER be the poster.
   */
  async postEntry(ctx: AuthContext, entryId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.findUnique({
        where: { id: entryId }, include: { lines: true, period: true }
      });
      if (!entry) throw new NotFoundException("Journal entry not found");
      if (entry.status !== "PENDING_APPROVAL")
        throw new ConflictException(`Entry is ${entry.status}, not pending approval`);
      if (entry.period.status !== "OPEN")
        throw new ConflictException("Accounting period is locked");

      // ── MAKER-CHECKER (ABAC separation of duties) ──────────────────────
      if (entry.preparedById === ctx.userId)
        throw new ForbiddenException("Separation of duties: the preparer cannot post their own entry");

      // Re-assert balance at post time (defense in depth against any tampering).
      const totalDebit = entry.lines.reduce((s, l) => s.plus(l.debit), ZERO);
      const totalCredit = entry.lines.reduce((s, l) => s.plus(l.credit), ZERO);
      if (!totalDebit.equals(totalCredit))
        throw new UnprocessableEntityException("Entry is unbalanced; refusing to post");

      // Only the controlled posting transition — permitted by the DB trigger.
      await tx.journalEntry.update({
        where: { id: entryId },
        data: { status: "POSTED", postedById: ctx.userId, postedAt: new Date() }
      });
    }, { isolationLevel: "Serializable" });
  }

  /**
   * Reverse a POSTED entry by appending a new balanced entry with debit/credit
   * swapped. The original is never modified except its terminal REVERSED flag.
   */
  async reverseEntry(ctx: AuthContext, entryId: string, reason: string): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const original = await tx.journalEntry.findUnique({
        where: { id: entryId }, include: { lines: true, period: true, reversedBy: true }
      });
      if (!original) throw new NotFoundException("Journal entry not found");
      if (original.status !== "POSTED")
        throw new ConflictException("Only POSTED entries can be reversed");
      if (original.reversedBy) throw new ConflictException("Entry already reversed");
      if (original.period.status !== "OPEN")
        throw new ConflictException("Cannot reverse into a locked period");
      // The reverser must differ from the original preparer (maker-checker on corrections too).
      if (original.preparedById === ctx.userId)
        throw new ForbiddenException("Separation of duties: preparer cannot reverse their own entry");

      const entryNo = await this.nextEntryNo(tx, original.entryDate.getUTCFullYear());
      const reversal = await tx.journalEntry.create({
        data: {
          entryNo,
          periodId: original.periodId,
          entryDate: original.entryDate,
          memo: `Reversal of ${original.entryNo}: ${reason}`,
          currency: original.currency,
          status: "POSTED",
          preparedById: ctx.userId,
          postedById: ctx.userId,        // reversal is system-authorized in one step
          postedAt: new Date(),
          reversalOfId: original.id,
          source: "reversal",
          sourceRef: original.id,
          lines: {
            create: original.lines.map((l) => ({
              entryDate: original.entryDate,
              accountId: l.accountId,
              debit: l.credit,           // swap
              credit: l.debit,
              lineMemo: `Reversal of line ${l.lineNo}`,
              lineNo: l.lineNo
            }))
          }
        }
      });

      // Mark the original terminal (allowed POSTED→REVERSED transition).
      await tx.journalEntry.update({ where: { id: original.id }, data: { status: "REVERSED" } });
      return reversal.id;
    }, { isolationLevel: "Serializable" });
  }

  /** Gapless sequential entry number scoped per year. */
  private async nextEntryNo(tx: Prisma.TransactionClient, year: number): Promise<string> {
    const count = await tx.journalEntry.count({
      where: { entryNo: { startsWith: `JE-${year}-` } }
    });
    return `JE-${year}-${String(count + 1).padStart(6, "0")}`;
  }
}
