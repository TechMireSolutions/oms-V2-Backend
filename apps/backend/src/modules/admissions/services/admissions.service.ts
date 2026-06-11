import {
  BadRequestException, ConflictException, ForbiddenException,
  Inject, Injectable, NotFoundException, Optional
} from "@nestjs/common";
import { randomInt } from "node:crypto";
import { getPrismaClient, type Prisma } from "@oms/db";
import { FieldCipher } from "@oms/crypto";
import type {
  AuthContext, ApplyRequest, ApplicationView,
  SubmitWelfareRequest, WelfareRequestView, RecommendRequest, DecideRequest
} from "@oms/dto";
import { IAM_CONTRACT, type IamContract } from "../../iam";
import { ADMISSIONS_PERMISSIONS, type AdmissionsContract } from "../contracts";
import { FIELD_CIPHER } from "./field-cipher.provider";
import {
  AUDIT_PORT, FINANCE_PORT, NOTIFICATION_PORT,
  type AuditPort, type FinancePort, type NotificationPort
} from "../ports";

// Encryption contexts — bind each ciphertext to its column so a blob can never
// be relocated to a different field (see @oms/crypto AAD binding).
const CTX = {
  nationalId:          "applicant.nationalId",
  dob:                 "applicant.dateOfBirth",
  address:             "applicant.address",
  financialBackground: "welfare.financialBackground",
  supportingNotes:     "welfare.supportingNotes",
  rationale:           "welfare.recommendation.rationale",
  decisionNotes:       "welfare.decision.notes"
} as const;

@Injectable()
export class AdmissionsService implements AdmissionsContract {
  private readonly prisma = getPrismaClient();

  constructor(
    @Inject(IAM_CONTRACT) private readonly iam: IamContract,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Optional() @Inject(FINANCE_PORT) private readonly finance?: FinancePort,
    @Optional() @Inject(NOTIFICATION_PORT) private readonly notifications?: NotificationPort,
    @Optional() @Inject(AUDIT_PORT) private readonly audit?: AuditPort
  ) {}

  // ── Zero-trust gate used by every contract method ─────────────────────
  private async require(ctx: AuthContext, permission: string): Promise<void> {
    if (!(await this.iam.checkPermission(ctx, permission)))
      throw new ForbiddenException(`Missing permission: ${permission}`);
  }

  private enc(value: string | undefined, context: string): string | null {
    return value == null || value === "" ? null : this.cipher.encrypt(value, context);
  }

  private reference(prefix: string): string {
    const year = new Date().getUTCFullYear();
    return `${prefix}-${year}-${randomInt(0, 1_000_000).toString().padStart(6, "0")}`;
  }

  // ── POST /admissions/apply ────────────────────────────────────────────
  async apply(ctx: AuthContext, input: ApplyRequest): Promise<ApplicationView> {
    await this.require(ctx, ADMISSIONS_PERMISSIONS.apply);
    // NOTE: customData is structurally valid (DTO). Deep validation against the
    // active FormDefinition is delegated to the Customisation engine (Part M).

    const app = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.applicantProfile.create({
        data: {
          fullName: input.applicant.fullName,
          email: input.applicant.email,
          phone: input.applicant.phone,
          nationalIdEnc: this.enc(input.applicant.nationalId, CTX.nationalId),
          nationalIdBidx: input.applicant.nationalId
            ? this.cipher.blindIndex(input.applicant.nationalId, CTX.nationalId)
            : null,
          dateOfBirthEnc: this.enc(input.applicant.dateOfBirth, CTX.dob),
          addressEnc: this.enc(input.applicant.address, CTX.address)
        }
      });
      return tx.application.create({
        data: {
          reference: this.reference("APP"),
          applicantId: profile.id,
          programKey: input.programKey,
          status: "SUBMITTED",
          customData: JSON.stringify(input.customData ?? {})  // JSON stored as TEXT (SQLite)
        }
      });
    });

    await this.audit?.logEvent({
      actorId: ctx.userId, action: "admissions.apply",
      entityType: "Application", entityId: app.id, after: { reference: app.reference }
    });
    await this.notifications?.notify(ctx, {
      template: "application.received", toEmail: input.applicant.email,
      data: { reference: app.reference }
    });

    return this.toApplicationView(app);
  }

  async getApplicationStatus(ctx: AuthContext, id: string): Promise<ApplicationView> {
    await this.require(ctx, ADMISSIONS_PERMISSIONS.readStatus);
    const app = await this.prisma.application.findUnique({ where: { id } });
    if (!app) throw new NotFoundException("Application not found");
    return this.toApplicationView(app);
  }

  // ── POST /welfare/submit-request ──────────────────────────────────────
  async submitWelfareRequest(ctx: AuthContext, input: SubmitWelfareRequest): Promise<WelfareRequestView> {
    await this.require(ctx, ADMISSIONS_PERMISSIONS.submitWelfare);

    const applicant = await this.prisma.applicantProfile.findUnique({ where: { id: input.applicantId } });
    if (!applicant) throw new NotFoundException("Applicant not found");

    const req = await this.prisma.welfareRequest.create({
      data: {
        reference: this.reference("WEL"),
        applicantId: input.applicantId,
        type: input.type,
        status: "SUBMITTED",
        requestedAmount: input.requestedAmount,
        financialBackgroundEnc: this.enc(input.financialBackground, CTX.financialBackground),
        supportingNotesEnc: this.enc(input.supportingNotes, CTX.supportingNotes),
        customData: JSON.stringify(input.customData ?? {})  // JSON stored as TEXT (SQLite)
      }
    });

    await this.audit?.logEvent({
      actorId: ctx.userId, action: "welfare.submit",
      entityType: "WelfareRequest", entityId: req.id, after: { reference: req.reference, type: req.type }
    });
    return this.toWelfareView(req);
  }

  // ── POST /welfare/recommend/{id} — the "maker" step ───────────────────
  async recommend(ctx: AuthContext, requestId: string, input: RecommendRequest): Promise<WelfareRequestView> {
    await this.require(ctx, ADMISSIONS_PERMISSIONS.recommend);

    const req = await this.prisma.welfareRequest.findUnique({
      where: { id: requestId }, include: { recommendation: true }
    });
    if (!req) throw new NotFoundException("Welfare request not found");
    if (req.recommendation) throw new ConflictException("Already recommended");
    if (!["SUBMITTED", "UNDER_REVIEW"].includes(req.status))
      throw new BadRequestException(`Cannot recommend in status ${req.status}`);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.welfareRecommendation.create({
        data: {
          requestId,
          recommendedBy: ctx.userId,
          outcome: input.outcome,
          recommendedAmount: input.recommendedAmount,
          rationaleEnc: this.enc(input.rationale, CTX.rationale)
        }
      });
      return tx.welfareRequest.update({ where: { id: requestId }, data: { status: "RECOMMENDED" } });
    });

    await this.audit?.logEvent({
      actorId: ctx.userId, action: "welfare.recommend",
      entityType: "WelfareRequest", entityId: requestId, after: { outcome: input.outcome }
    });
    return this.toWelfareView(updated);
  }

  // ── PUT /welfare/decide/{id} — the "checker" step (separation of duties) ─
  async decide(ctx: AuthContext, requestId: string, input: DecideRequest): Promise<WelfareRequestView> {
    await this.require(ctx, ADMISSIONS_PERMISSIONS.decide);

    const req = await this.prisma.welfareRequest.findUnique({
      where: { id: requestId }, include: { recommendation: true, decision: true }
    });
    if (!req) throw new NotFoundException("Welfare request not found");
    if (!req.recommendation) throw new BadRequestException("Request must be recommended before a decision");
    if (req.decision) throw new ConflictException("Already decided");

    // SEPARATION OF DUTIES (ABAC): the recommender cannot also decide.
    if (req.recommendation.recommendedBy === ctx.userId)
      throw new ForbiddenException("Maker-checker: the recommender cannot approve their own recommendation");

    const finalAmount = input.outcome === "APPROVED" ? (input.approvedAmount ?? 0) : 0;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.welfareDecision.create({
        data: {
          requestId,
          decidedBy: ctx.userId,
          outcome: input.outcome,
          approvedAmount: input.outcome === "APPROVED" ? finalAmount : null,
          notesEnc: this.enc(input.notes, CTX.decisionNotes)
        }
      });
      return tx.welfareRequest.update({
        where: { id: requestId },
        data: { status: input.outcome === "APPROVED" ? "APPROVED" : "REJECTED" }
      });
    });

    // On approval, trigger Finance to post the subsidy/waiver journal entry.
    if (input.outcome === "APPROVED" && finalAmount > 0 && this.finance) {
      const { journalEntryId } = await this.finance.postWelfareSubsidy(ctx, {
        welfareRequestId: requestId, type: req.type, amount: finalAmount,
        beneficiaryApplicantId: req.applicantId
      });
      await this.prisma.welfareDecision.update({
        where: { requestId }, data: { financeJournalId: journalEntryId }
      });
    }

    await this.audit?.logEvent({
      actorId: ctx.userId, action: "welfare.decide",
      entityType: "WelfareRequest", entityId: requestId,
      after: { outcome: input.outcome, approvedAmount: finalAmount }
    });
    await this.notifications?.notify(ctx, {
      template: "welfare.decided", data: { requestId, outcome: input.outcome }
    });
    return this.toWelfareView(updated);
  }

  // ── view mappers (never leak ciphertext) ──────────────────────────────
  private toApplicationView(a: {
    id: string; reference: string; programKey: string; status: string;
    customData: string | null; submittedAt: Date;
  }): ApplicationView {
    return {
      id: a.id, reference: a.reference, programKey: a.programKey,
      status: a.status as ApplicationView["status"],
      customData: safeJson(a.customData),
      submittedAt: a.submittedAt.toISOString()
    };
  }

  private toWelfareView(w: {
    id: string; reference: string; applicantId: string; type: string;
    status: string; requestedAmount: Prisma.Decimal | null; submittedAt: Date;
  }): WelfareRequestView {
    return {
      id: w.id, reference: w.reference, applicantId: w.applicantId,
      type: w.type as WelfareRequestView["type"],
      status: w.status as WelfareRequestView["status"],
      requestedAmount: w.requestedAmount ? Number(w.requestedAmount) : null,
      submittedAt: w.submittedAt.toISOString()
    };
  }
}

// Parse a JSON string column (SQLite stores JSON as TEXT) into an object.
function safeJson(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
}
