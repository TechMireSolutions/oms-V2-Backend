import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import {
  ApplyRequestSchema, SubmitWelfareRequestSchema, RecommendRequestSchema, DecideRequestSchema,
  type AuthContext, type ApplicationView, type WelfareRequestView
} from "@oms/dto";
import { CurrentUser, RequirePermissions } from "../../iam";
import { ADMISSIONS_PERMISSIONS } from "../contracts";
import { AdmissionsService } from "../services/admissions.service";

// All routes are authenticated by the global JwtAuthGuard; @RequirePermissions
// drives the PermissionsGuard, and the service re-checks again (defense in depth).
@Controller()
export class AdmissionsController {
  constructor(private readonly svc: AdmissionsService) {}

  @Post("admissions/apply")
  @RequirePermissions(ADMISSIONS_PERMISSIONS.apply)
  async apply(@CurrentUser() ctx: AuthContext, @Body() body: unknown): Promise<ApplicationView> {
    const parsed = ApplyRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.svc.apply(ctx, parsed.data);
  }

  @Get("admissions/status/:id")
  @RequirePermissions(ADMISSIONS_PERMISSIONS.readStatus)
  async status(
    @CurrentUser() ctx: AuthContext,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<ApplicationView> {
    return this.svc.getApplicationStatus(ctx, id);
  }

  @Post("welfare/submit-request")
  @RequirePermissions(ADMISSIONS_PERMISSIONS.submitWelfare)
  async submitWelfare(@CurrentUser() ctx: AuthContext, @Body() body: unknown): Promise<WelfareRequestView> {
    const parsed = SubmitWelfareRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.svc.submitWelfareRequest(ctx, parsed.data);
  }

  @Post("welfare/recommend/:id")
  @RequirePermissions(ADMISSIONS_PERMISSIONS.recommend)
  async recommend(
    @CurrentUser() ctx: AuthContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown
  ): Promise<WelfareRequestView> {
    const parsed = RecommendRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.svc.recommend(ctx, id, parsed.data);
  }

  @Put("welfare/decide/:id")
  @RequirePermissions(ADMISSIONS_PERMISSIONS.decide)
  async decide(
    @CurrentUser() ctx: AuthContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown
  ): Promise<WelfareRequestView> {
    const parsed = DecideRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.svc.decide(ctx, id, parsed.data);
  }
}
