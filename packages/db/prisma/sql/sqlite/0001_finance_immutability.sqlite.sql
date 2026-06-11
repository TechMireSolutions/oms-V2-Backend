-- ============================================================================
-- OMS Finance — append-only immutability for SQLite.
-- Apply AFTER `prisma migrate dev` (or `prisma db push`):
--   sqlite3 dev.db < packages/db/prisma/sql/sqlite/0001_finance_immutability.sqlite.sql
--
-- SQLite has no table partitioning (a Postgres perf feature), but it DOES
-- support BEFORE triggers with RAISE(ABORT) and partial indexes — enough to
-- enforce the correctness invariants:
--   1. JournalLine is fully append-only (no UPDATE/DELETE).
--   2. JournalEntry is immutable except the controlled posting/reversal
--      status transition; DELETE is forbidden. Corrections = reversing entries.
-- ============================================================================

-- ── JournalLine: never updatable or deletable ──────────────────────────────
CREATE TRIGGER IF NOT EXISTS trg_journalline_no_update
BEFORE UPDATE ON "JournalLine"
BEGIN
  SELECT RAISE(ABORT, 'JournalLine is append-only: UPDATE not permitted. Use a reversing entry.');
END;

CREATE TRIGGER IF NOT EXISTS trg_journalline_no_delete
BEFORE DELETE ON "JournalLine"
BEGIN
  SELECT RAISE(ABORT, 'JournalLine is append-only: DELETE not permitted.');
END;

-- ── JournalEntry: freeze financial/identity columns; allow only posting txn ──
CREATE TRIGGER IF NOT EXISTS trg_journalentry_guard_update
BEFORE UPDATE ON "JournalEntry"
WHEN
     NEW."entryNo"      IS NOT OLD."entryNo"
  OR NEW."periodId"     IS NOT OLD."periodId"
  OR NEW."entryDate"    IS NOT OLD."entryDate"
  OR NEW."memo"         IS NOT OLD."memo"
  OR NEW."currency"     IS NOT OLD."currency"
  OR NEW."preparedById" IS NOT OLD."preparedById"
  OR NEW."reversalOfId" IS NOT OLD."reversalOfId"
  OR NEW."source"       IS NOT OLD."source"
  OR NEW."sourceRef"    IS NOT OLD."sourceRef"
  OR NEW."createdAt"    IS NOT OLD."createdAt"
  OR (OLD."status" = 'POSTED'   AND NEW."status" <> 'REVERSED')
  OR (OLD."status" = 'REVERSED')
BEGIN
  SELECT RAISE(ABORT, 'JournalEntry is immutable; only the posting transition may change. Use a reversing entry.');
END;

CREATE TRIGGER IF NOT EXISTS trg_journalentry_no_delete
BEFORE DELETE ON "JournalEntry"
BEGIN
  SELECT RAISE(ABORT, 'JournalEntry is append-only: DELETE not permitted.');
END;

-- ── "One PUBLISHED version" invariants (Customisation + Branding) ──────────
-- SQLite supports partial indexes, so the same guarantees apply.
CREATE UNIQUE INDEX IF NOT EXISTS "FieldDefinition_one_published"
  ON "FieldDefinition" ("entityType", "key") WHERE "status" = 'PUBLISHED';
CREATE UNIQUE INDEX IF NOT EXISTS "FormDefinition_one_published"
  ON "FormDefinition" ("key") WHERE "status" = 'PUBLISHED';
CREATE UNIQUE INDEX IF NOT EXISTS "BrandProfile_one_published_global"
  ON "BrandProfile" ("scope") WHERE "status" = 'PUBLISHED' AND "scope" = 'GLOBAL';
CREATE UNIQUE INDEX IF NOT EXISTS "BrandProfile_one_published_location"
  ON "BrandProfile" ("locationId") WHERE "status" = 'PUBLISHED' AND "scope" = 'LOCATION';
