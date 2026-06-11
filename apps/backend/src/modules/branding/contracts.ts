// Branding & Theming — public contract surface.
import type { AuthContext, UpsertBrand, BrandView, ActiveBrand } from "@oms/dto";

export const BRANDING_CONTRACT = Symbol("BRANDING_CONTRACT");

export interface BrandingContract {
  // Resolve the effective brand for a tenant/location (cached). Public-safe:
  // contains only presentational data, no PII.
  getActiveBrand(locationId?: string): Promise<ActiveBrand>;

  upsertDraft(ctx: AuthContext, input: UpsertBrand): Promise<BrandView>;
  publish(ctx: AuthContext, id: string): Promise<BrandView>;
  rollback(ctx: AuthContext, targetVersionId: string): Promise<BrandView>;
}

export const BRANDING_PERMISSIONS = {
  manage: "branding.manage"   // SuperAdmin only
} as const;
