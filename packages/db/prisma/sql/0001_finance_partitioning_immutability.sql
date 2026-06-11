-- ============================================================================
-- OMS Finance — partitioning + append-only immutability  [POSTGRESQL ONLY]
-- ----------------------------------------------------------------------------
-- NOTE: The project now uses SQLite (see schema.prisma). This file is retained
-- for a future PostgreSQL deployment ONLY — SQLite has no table partitioning.
-- For SQLite, apply sql/sqlite/0001_finance_immutability.sqlite.sql instead,
-- which preserves the append-only invariant via triggers (partitioning is a
-- Postgres-specific performance optimisation, not a correctness requirement).
-- ----------------------------------------------------------------------------
-- Apply AFTER `prisma migrate` for the finance models. This migration:
--   1. Converts journal_entry / journal_line into RANGE-partitioned tables
--      keyed by entry_date (one partition per accounting period/month).
--   2. Adds triggers that make POSTED entries and ALL lines strictly
--      append-only: financial columns can never be UPDATEd or DELETEd.
--      Corrections must be made via reversing entries only.
--   3. Provides a helper to provision a partition when a period is created.
--
-- Postgres requires the partition key to be part of the primary key, so the
-- physical PK on these tables is (id, entry_date) — hence the denormalized
-- entry_date column on journal_line.
--
-- This file is the source of truth for DDL on these two tables; the plain
-- CREATE TABLE that Prisma would emit for them should be removed from the
-- generated migration (or this script run against a fresh DB before seeding).
-- ============================================================================

-- ─── 1. Partitioned ledger tables ──────────────────────────────────────────
-- Drop the non-partitioned tables Prisma created, then recreate as partitioned.
DROP TABLE IF EXISTS "JournalLine"  CASCADE;
DROP TABLE IF EXISTS "JournalEntry" CASCADE;

CREATE TABLE "JournalEntry" (
  "id"           uuid        NOT NULL DEFAULT gen_random_uuid(),
  "entryNo"      text        NOT NULL,
  "periodId"     uuid        NOT NULL,
  "entryDate"    date        NOT NULL,
  "memo"         text,
  "status"       text        NOT NULL DEFAULT 'PENDING_APPROVAL',
  "currency"     text        NOT NULL DEFAULT 'PHP',
  "preparedById" uuid        NOT NULL,
  "postedById"   uuid,
  "postedAt"     timestamptz,
  "reversalOfId" uuid,
  "source"       text        NOT NULL DEFAULT 'manual',
  "sourceRef"    text,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id", "entryDate")
) PARTITION BY RANGE ("entryDate");

CREATE UNIQUE INDEX "JournalEntry_entryNo_key" ON "JournalEntry" ("entryNo", "entryDate");
CREATE INDEX "JournalEntry_period_status_idx" ON "JournalEntry" ("periodId", "status");
CREATE INDEX "JournalEntry_entryDate_idx"      ON "JournalEntry" ("entryDate");

CREATE TABLE "JournalLine" (
  "id"        uuid           NOT NULL DEFAULT gen_random_uuid(),
  "entryId"   uuid           NOT NULL,
  "entryDate" date           NOT NULL,
  "accountId" uuid           NOT NULL,
  "debit"     numeric(18,4)  NOT NULL DEFAULT 0,
  "credit"    numeric(18,4)  NOT NULL DEFAULT 0,
  "lineMemo"  text,
  "lineNo"    integer        NOT NULL,
  PRIMARY KEY ("id", "entryDate"),
  -- Each line is one-sided and non-negative.
  CONSTRAINT "JournalLine_one_sided_chk"
    CHECK ("debit" >= 0 AND "credit" >= 0 AND NOT ("debit" > 0 AND "credit" > 0)),
  CONSTRAINT "JournalLine_nonzero_chk"
    CHECK ("debit" > 0 OR "credit" > 0)
) PARTITION BY RANGE ("entryDate");

CREATE UNIQUE INDEX "JournalLine_entry_lineNo_key" ON "JournalLine" ("entryId", "lineNo", "entryDate");
CREATE INDEX "JournalLine_account_idx" ON "JournalLine" ("accountId");
CREATE INDEX "JournalLine_entry_idx"   ON "JournalLine" ("entryId");

-- A catch-all default partition so inserts never fail before a period exists.
CREATE TABLE IF NOT EXISTS "JournalEntry_default" PARTITION OF "JournalEntry" DEFAULT;
CREATE TABLE IF NOT EXISTS "JournalLine_default"  PARTITION OF "JournalLine"  DEFAULT;

-- ─── 2. Append-only immutability triggers ──────────────────────────────────
-- Journal lines: NEVER updatable or deletable.
CREATE OR REPLACE FUNCTION oms_block_line_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'JournalLine is append-only: % is not permitted. Use a reversing entry.', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_journalline_no_update
  BEFORE UPDATE ON "JournalLine"
  FOR EACH ROW EXECUTE FUNCTION oms_block_line_mutation();
CREATE TRIGGER trg_journalline_no_delete
  BEFORE DELETE ON "JournalLine"
  FOR EACH ROW EXECUTE FUNCTION oms_block_line_mutation();

-- Journal entries: DELETE forbidden; UPDATE allowed ONLY for the controlled
-- posting/reversal transition (status, postedById, postedAt). All financial
-- and identity columns are frozen — any attempt to change them is rejected.
CREATE OR REPLACE FUNCTION oms_guard_entry_update() RETURNS trigger AS $$
BEGIN
  IF NEW."entryNo"      IS DISTINCT FROM OLD."entryNo"
     OR NEW."periodId"  IS DISTINCT FROM OLD."periodId"
     OR NEW."entryDate" IS DISTINCT FROM OLD."entryDate"
     OR NEW."memo"      IS DISTINCT FROM OLD."memo"
     OR NEW."currency"  IS DISTINCT FROM OLD."currency"
     OR NEW."preparedById" IS DISTINCT FROM OLD."preparedById"
     OR NEW."reversalOfId" IS DISTINCT FROM OLD."reversalOfId"
     OR NEW."source"    IS DISTINCT FROM OLD."source"
     OR NEW."sourceRef" IS DISTINCT FROM OLD."sourceRef"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'JournalEntry is immutable; only the posting transition may change. Use a reversing entry.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Legal status transitions only.
  IF OLD."status" = 'POSTED' AND NEW."status" <> 'REVERSED' THEN
    RAISE EXCEPTION 'A POSTED entry can only move to REVERSED.' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" = 'REVERSED' THEN
    RAISE EXCEPTION 'A REVERSED entry is final.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION oms_block_entry_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'JournalEntry is append-only: DELETE is not permitted.'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_journalentry_guard_update
  BEFORE UPDATE ON "JournalEntry"
  FOR EACH ROW EXECUTE FUNCTION oms_guard_entry_update();
CREATE TRIGGER trg_journalentry_no_delete
  BEFORE DELETE ON "JournalEntry"
  FOR EACH ROW EXECUTE FUNCTION oms_block_entry_delete();

-- ─── 3. Partition provisioning helper ──────────────────────────────────────
-- Call once per accounting period (e.g. from the service when a period opens).
CREATE OR REPLACE FUNCTION oms_create_ledger_partition(p_from date, p_to date, p_suffix text)
RETURNS void AS $$
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF "JournalEntry" FOR VALUES FROM (%L) TO (%L)',
    'JournalEntry_' || p_suffix, p_from, p_to);
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF "JournalLine" FOR VALUES FROM (%L) TO (%L)',
    'JournalLine_' || p_suffix, p_from, p_to);
END;
$$ LANGUAGE plpgsql;

-- Example: SELECT oms_create_ledger_partition('2026-01-01','2026-04-01','2026q1');
