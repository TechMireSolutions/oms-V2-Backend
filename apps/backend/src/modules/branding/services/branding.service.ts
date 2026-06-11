import {
  ForbiddenException, Inject, Injectable, NotFoundException, Optional
} from "@nestjs/common";
import { createHash } from "node:crypto";
import type Redis from "ioredis";
import { getPrismaClient } from "@oms/db";
import {
  ThemeTokensSchema, BrandImagerySchema,
  type AuthContext, type UpsertBrand, type BrandView, type ActiveBrand
} from "@oms/dto";
import { IAM_CONTRACT, type IamContract } from "../../iam";
import { BRANDING_PERMISSIONS, type BrandingContract } from "../contracts";
import { AUDIT_PORT, type AuditPort } from "../ports";
import { BRANDING_REDIS } from "./redis.provider";

// Sensible defaults so the UI always renders even before any brand is published.
const DEFAULT_BRAND: ActiveBrand = {
  id: "00000000-0000-0000-0000-000000000000",
  scope: "GLOBAL",
  version: 0,
  appName: "OMS",
  tagline: null,
  footerText: null,
  imagery: {},
  tokens: ThemeTokensSchema.parse({ colors: { primary: "#1d4ed8" } }),
  etag: "default"
};

@Injectable()
export class BrandingService implements BrandingContract {
  private readonly prisma = getPrismaClient();
  private readonly TTL = 60 * 60; // 1h; publish invalidates earlier

  constructor(
    @Inject(IAM_CONTRACT) private readonly iam: IamContract,
    @Inject(BRANDING_REDIS) private readonly redis: Redis,
    @Optional() @Inject(AUDIT_PORT) private readonly audit?: AuditPort
  ) {}

  private cacheKey(locationId?: string): string {
    return `branding:active:${locationId ?? "global"}`;
  }

  private async require(ctx: AuthContext): Promise<void> {
    if (!(await this.iam.checkPermission(ctx, BRANDING_PERMISSIONS.manage)))
      throw new ForbiddenException("Missing permission: branding.manage");
  }

  // ── GET /branding/active (cached) ─────────────────────────────────────
  async getActiveBrand(locationId?: string): Promise<ActiveBrand> {
    const key = this.cacheKey(locationId);
    // Cache is an optimization, not a hard dependency: if Redis is unavailable
    // we transparently fall back to the database.
    try {
      const cached = await this.redis.get(key);
      if (cached) return JSON.parse(cached) as ActiveBrand;
    } catch { /* Redis down — fall through to DB */ }

    const brand = await this.resolveFromDb(locationId);
    try { await this.redis.set(key, JSON.stringify(brand), "EX", this.TTL); } catch { /* ignore */ }
    return brand;
  }

  /** Location brand wins; otherwise the global brand; otherwise defaults. */
  private async resolveFromDb(locationId?: string): Promise<ActiveBrand> {
    const row =
      (locationId
        ? await this.prisma.brandProfile.findFirst({
            where: { scope: "LOCATION", locationId, status: "PUBLISHED" },
            include: { themeTokens: true }
          })
        : null) ??
      (await this.prisma.brandProfile.findFirst({
        where: { scope: "GLOBAL", status: "PUBLISHED" },
        include: { themeTokens: true }
      }));

    if (!row) return DEFAULT_BRAND;

    // tokens/imagery are stored as JSON strings (SQLite) — parse then validate.
    const tokens = ThemeTokensSchema.parse(parseJson(row.themeTokens?.tokens, { colors: { primary: "#1d4ed8" } }));
    const imagery = BrandImagerySchema.parse(parseJson(row.imagery, {}));
    const payload = {
      id: row.id, scope: row.scope as ActiveBrand["scope"], version: row.version,
      appName: row.appName, tagline: row.tagline, footerText: row.footerText,
      imagery, tokens
    };
    const etag = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
    return { ...payload, etag };
  }

  // ── Authoring (DRAFT) ─────────────────────────────────────────────────
  async upsertDraft(ctx: AuthContext, input: UpsertBrand): Promise<BrandView> {
    await this.require(ctx);
    // Re-validate tokens/imagery (defense-in-depth; controller already parsed).
    const tokens = ThemeTokensSchema.parse(input.tokens);
    const imagery = BrandImagerySchema.parse(input.imagery);

    const version = await this.nextVersion(input.scope, input.locationId);
    const row = await this.prisma.brandProfile.create({
      data: {
        scope: input.scope, locationId: input.locationId, version, status: "DRAFT",
        appName: input.appName, tagline: input.tagline, footerText: input.footerText,
        imagery: JSON.stringify(imagery), createdById: ctx.userId,
        themeTokens: { create: { tokens: JSON.stringify(tokens) } }
      }
    });
    await this.audit?.logEvent({
      actorId: ctx.userId, action: "branding.draft", entityType: "BrandProfile",
      entityId: row.id, after: { scope: row.scope, version }
    });
    return this.toView(row);
  }

  // ── Publish (supersede current + INSTANT cache invalidation) ──────────
  async publish(ctx: AuthContext, id: string): Promise<BrandView> {
    await this.require(ctx);
    const updated = await this.prisma.$transaction(async (tx) => {
      const brand = await tx.brandProfile.findUnique({ where: { id } });
      if (!brand) throw new NotFoundException("Brand profile not found");

      await tx.brandProfile.updateMany({
        where: {
          scope: brand.scope, locationId: brand.locationId, status: "PUBLISHED", id: { not: id }
        },
        data: { status: "SUPERSEDED" }
      });
      return tx.brandProfile.update({
        where: { id }, data: { status: "PUBLISHED", publishedAt: new Date() }
      });
    });

    await this.invalidate(updated.locationId ?? undefined, updated.scope);
    await this.audit?.logEvent({
      actorId: ctx.userId, action: "branding.publish", entityType: "BrandProfile",
      entityId: updated.id, after: { version: updated.version }
    });
    return this.toView(updated);
  }

  async rollback(ctx: AuthContext, targetVersionId: string): Promise<BrandView> {
    await this.require(ctx);
    return this.publish(ctx, targetVersionId); // re-publishing a prior version supersedes current
  }

  /** Instant invalidation: drop the cache key(s) so the next read repopulates. */
  private async invalidate(locationId: string | undefined, scope: string): Promise<void> {
    const keys = [this.cacheKey(locationId)];
    // A new GLOBAL brand affects every location that falls back to it.
    if (scope === "GLOBAL") keys.push(this.cacheKey(undefined));
    await this.redis.del(...new Set(keys));
  }

  // ── helpers ───────────────────────────────────────────────────────────
  private async nextVersion(scope: string, locationId?: string): Promise<number> {
    const max = await this.prisma.brandProfile.aggregate({
      where: { scope: scope as any, locationId: locationId ?? null }, _max: { version: true }
    });
    return (max._max.version ?? 0) + 1;
  }

  private toView(row: {
    id: string; scope: string; version: number; status: string; appName: string; publishedAt: Date | null;
  }): BrandView {
    return {
      id: row.id, scope: row.scope as BrandView["scope"], version: row.version,
      status: row.status as BrandView["status"], appName: row.appName,
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null
    };
  }
}

// Parse a JSON-string column (SQLite stores JSON as TEXT) with a fallback.
function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string") return (raw as T) ?? fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}
