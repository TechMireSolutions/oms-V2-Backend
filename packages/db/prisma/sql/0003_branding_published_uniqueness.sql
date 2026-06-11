-- ============================================================================
-- OMS Branding — "one PUBLISHED brand per scope" invariant.
-- Apply after `prisma migrate` for the branding models.
-- ============================================================================

-- One PUBLISHED global brand (locationId IS NULL).
CREATE UNIQUE INDEX IF NOT EXISTS "BrandProfile_one_published_global"
  ON "BrandProfile" ((1))
  WHERE "status" = 'PUBLISHED' AND "scope" = 'GLOBAL';

-- One PUBLISHED brand per location.
CREATE UNIQUE INDEX IF NOT EXISTS "BrandProfile_one_published_location"
  ON "BrandProfile" ("locationId")
  WHERE "status" = 'PUBLISHED' AND "scope" = 'LOCATION';
