import { z } from "zod";
import { UuidSchema } from "./common";

// Dynamic intake fields are an open record validated structurally here and
// against the active FormDefinition (Part M) at the service layer.
const CustomDataSchema = z.record(z.string(), z.unknown()).default({});

// ── Admissions ──────────────────────────────────────────────────────────
export const ApplyRequestSchema = z.object({
  programKey: z.string().min(1).max(120),
  applicant: z.object({
    fullName: z.string().min(1).max(200),
    email: z.string().email(),
    phone: z.string().max(40).optional(),
    // Sensitive — encrypted before persistence.
    nationalId: z.string().max(64).optional(),
    dateOfBirth: z.string().date().optional(),
    address: z.string().max(500).optional()
  }),
  customData: CustomDataSchema
});
export type ApplyRequest = z.infer<typeof ApplyRequestSchema>;

export const ApplicationStatusSchema = z.enum([
  "SUBMITTED", "UNDER_REVIEW", "ACCEPTED", "REJECTED", "WITHDRAWN"
]);

export const ApplicationViewSchema = z.object({
  id: UuidSchema,
  reference: z.string(),
  programKey: z.string(),
  status: ApplicationStatusSchema,
  customData: z.record(z.string(), z.unknown()),
  submittedAt: z.string()
});
export type ApplicationView = z.infer<typeof ApplicationViewSchema>;

// ── Welfare ───────────────────────────────────────────────────────────────
export const WelfareTypeSchema = z.enum(["SUBSIDY", "FEE_WAIVER", "HARDSHIP_GRANT"]);

export const SubmitWelfareRequestSchema = z.object({
  applicantId: UuidSchema,
  type: WelfareTypeSchema,
  requestedAmount: z.number().nonnegative().optional(),
  // Sensitive PII — encrypted at rest.
  financialBackground: z.string().max(5000).optional(),
  supportingNotes: z.string().max(5000).optional(),
  customData: CustomDataSchema
});
export type SubmitWelfareRequest = z.infer<typeof SubmitWelfareRequestSchema>;

export const RecommendRequestSchema = z.object({
  outcome: z.enum(["RECOMMEND_APPROVE", "RECOMMEND_REJECT"]),
  recommendedAmount: z.number().nonnegative().optional(),
  rationale: z.string().max(5000).optional()
});
export type RecommendRequest = z.infer<typeof RecommendRequestSchema>;

export const DecideRequestSchema = z.object({
  outcome: z.enum(["APPROVED", "REJECTED"]),
  approvedAmount: z.number().nonnegative().optional(),
  notes: z.string().max(5000).optional()
});
export type DecideRequest = z.infer<typeof DecideRequestSchema>;

export const WelfareStatusSchema = z.enum([
  "SUBMITTED", "UNDER_REVIEW", "RECOMMENDED", "APPROVED", "REJECTED"
]);

export const WelfareRequestViewSchema = z.object({
  id: UuidSchema,
  reference: z.string(),
  applicantId: UuidSchema,
  type: WelfareTypeSchema,
  status: WelfareStatusSchema,
  requestedAmount: z.number().nullable(),
  submittedAt: z.string()
});
export type WelfareRequestView = z.infer<typeof WelfareRequestViewSchema>;
