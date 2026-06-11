import { BadRequestException, Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { UpsertBrandSchema, type AuthContext, type ActiveBrand, type BrandView } from "@oms/dto";
import { CurrentUser, Public, RequirePermissions } from "../../iam";
import { BRANDING_PERMISSIONS } from "../contracts";
import { BrandingService } from "../services/branding.service";

@Controller("branding")
export class BrandingController {
  constructor(private readonly svc: BrandingService) {}

  // PUBLIC: the login screen and first paint need the brand before auth.
  // Contains only presentational data (no PII). Cacheable at the edge.
  @Public()
  @Get("active")
  @Header("Cache-Control", "public, max-age=60, stale-while-revalidate=300")
  async active(@Query("locationId") locationId?: string): Promise<ActiveBrand> {
    return this.svc.getActiveBrand(locationId);
  }

  @Post()
  @RequirePermissions(BRANDING_PERMISSIONS.manage)
  async upsert(@CurrentUser() ctx: AuthContext, @Body() body: unknown): Promise<BrandView> {
    const parsed = UpsertBrandSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.svc.upsertDraft(ctx, parsed.data);
  }

  @Post(":id/publish")
  @RequirePermissions(BRANDING_PERMISSIONS.manage)
  async publish(
    @CurrentUser() ctx: AuthContext,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<BrandView> {
    return this.svc.publish(ctx, id);
  }

  @Put(":id/rollback")
  @RequirePermissions(BRANDING_PERMISSIONS.manage)
  async rollback(
    @CurrentUser() ctx: AuthContext,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<BrandView> {
    return this.svc.rollback(ctx, id);
  }
}
