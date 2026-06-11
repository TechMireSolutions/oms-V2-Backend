-- ============================================================================
-- OMS Customisation — "one PUBLISHED version per logical artefact" invariant.
-- Apply after `prisma migrate` for the customisation models. Partial unique
-- indexes can't be expressed in the Prisma schema, so they live here.
-- ============================================================================

-- A given (entityType, key) field may have at most ONE PUBLISHED version.
CREATE UNIQUE INDEX IF NOT EXISTS "FieldDefinition_one_published"
  ON "FieldDefinition" ("entityType", "key")
  WHERE "status" = 'PUBLISHED';

-- A given form key may have at most ONE PUBLISHED version.
CREATE UNIQUE INDEX IF NOT EXISTS "FormDefinition_one_published"
  ON "FormDefinition" ("key")
  WHERE "status" = 'PUBLISHED';
