// Admissions & Welfare — public contract surface.
// Other modules consume ONLY this file (via the barrel). Every method takes an
// AuthContext; the service re-checks the required permission (zero-trust).
import type {
  AuthContext, ApplyRequest, ApplicationView,
  SubmitWelfareRequest, WelfareRequestView, RecommendRequest, DecideRequest
} from "@oms/dto";

export const ADMISSIONS_CONTRACT = Symbol("ADMISSIONS_CONTRACT");

export interface AdmissionsContract {
  apply(ctx: AuthContext, input: ApplyRequest): Promise<ApplicationView>;
  getApplicationStatus(ctx: AuthContext, id: string): Promise<ApplicationView>;

  submitWelfareRequest(ctx: AuthContext, input: SubmitWelfareRequest): Promise<WelfareRequestView>;
  recommend(ctx: AuthContext, requestId: string, input: RecommendRequest): Promise<WelfareRequestView>;
  decide(ctx: AuthContext, requestId: string, input: DecideRequest): Promise<WelfareRequestView>;
}

// Permission keys owned by this module (registered with IAM at seed time).
export const ADMISSIONS_PERMISSIONS = {
  apply:           "admissions.application.create",
  readStatus:      "admissions.application.read",
  submitWelfare:   "welfare.request.create",
  recommend:       "welfare.decision.recommend",
  decide:          "welfare.decision.approve"
} as const;
