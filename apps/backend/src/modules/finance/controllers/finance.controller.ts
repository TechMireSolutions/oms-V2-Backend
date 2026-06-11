import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import {
  CreateJournalEntrySchema, ApproveJournalEntrySchema, GenerateInvoiceSchema,
  type AuthContext, type JournalEntryView, type InvoiceView, type TrialBalance
} from "@oms/dto";
import { CurrentUser, RequirePermissions } from "../../iam";
import { FINANCE_PERMISSIONS } from "../contracts";
import { FinanceService } from "../services/finance.service";

@Controller("finance")
export class FinanceController {
  constructor(private readonly svc: FinanceService) {}

  // Maker: prepare a balanced entry (validated Debits == Credits).
  @Post("journal-entry")
  @RequirePermissions(FINANCE_PERMISSIONS.prepare)
  async createEntry(@CurrentUser() ctx: AuthContext, @Body() body: unknown): Promise<JournalEntryView> {
    const parsed = CreateJournalEntrySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.svc.createJournalEntry(ctx, parsed.data);
  }

  // Checker: post it (enforces preparer != poster).
  @Post("journal-entry/:id/approve")
  @RequirePermissions(FINANCE_PERMISSIONS.post)
  async approveEntry(
    @CurrentUser() ctx: AuthContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown
  ): Promise<JournalEntryView> {
    const parsed = ApproveJournalEntrySchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.svc.approveJournalEntry(ctx, id, parsed.data);
  }

  // Corrections via reversing entry only.
  @Post("journal-entry/:id/reverse")
  @RequirePermissions(FINANCE_PERMISSIONS.reverse)
  async reverseEntry(
    @CurrentUser() ctx: AuthContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { reason?: string }
  ): Promise<JournalEntryView> {
    const reason = (body?.reason ?? "").trim();
    if (!reason) throw new BadRequestException("A reversal reason is required");
    return this.svc.reverseJournalEntry(ctx, id, reason);
  }

  @Get("trial-balance")
  @RequirePermissions(FINANCE_PERMISSIONS.trialBalance)
  async trialBalance(
    @CurrentUser() ctx: AuthContext,
    @Query("periodId") periodId?: string,
    @Query("asOf") asOf?: string
  ): Promise<TrialBalance> {
    return this.svc.getTrialBalance(ctx, { periodId, asOf });
  }

  @Post("invoices/generate")
  @RequirePermissions(FINANCE_PERMISSIONS.invoice)
  async generateInvoice(@CurrentUser() ctx: AuthContext, @Body() body: unknown): Promise<InvoiceView> {
    const parsed = GenerateInvoiceSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.svc.generateInvoice(ctx, parsed.data);
  }
}
