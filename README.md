# OMS Backend

Office Management System — NestJS (TypeScript) modular-monolith API.

Modular monolith with strict contract boundaries. Modules: IAM, Audit, Notification,
Finance (double-entry ledger), Admissions & Welfare, Customisation (metadata engine),
AI Assistant, Branding, Operations, Collaboration/Tasks, Policy & Compliance, Integration Gateway.

## Stack
- NestJS 10 · Prisma (SQLite for dev) · Zod DTOs · Argon2id + JWT + TOTP MFA
- Redis optional (sessions/quotas/brute-force) — the app runs without it in dev

## Getting started
```bash
pnpm install
cp .env.example .env
pnpm prisma:generate
pnpm prisma:migrate          # creates the SQLite DB + tables
# (optional) append-only finance triggers + partial indexes:
#   sqlite3 packages/db/prisma/dev.db < packages/db/prisma/sql/sqlite/0001_finance_immutability.sqlite.sql
pnpm build
pnpm seed                    # creates SuperAdmin: admin@oms.local / Admin12345!
pnpm start                   # http://localhost:4000
```

## Layout
```
apps/backend       NestJS app (src/modules/* — one folder per module)
packages/dto       shared Zod schemas / types (@oms/dto)
packages/db        Prisma client + schema + migrations (@oms/db)
packages/config    validated env loader (@oms/config)
packages/crypto    AES-256-GCM field encryption (@oms/crypto)
```

Default DB is SQLite; switch `datasource db` provider + `DATABASE_URL` to PostgreSQL for production.
