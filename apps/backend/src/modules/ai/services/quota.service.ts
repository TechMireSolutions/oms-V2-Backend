import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type Redis from "ioredis";
import { loadEnv } from "@oms/config";
import type { AuthContext, AiQuotaView } from "@oms/dto";
import { AI_REDIS } from "./redis.provider";

/**
 * Token metering + quota guardrails. Counters live in Redis keyed by month
 * (auto-expiring), with a durable record written to AiRequestLog by the caller.
 *   - Per-role monthly cap (the most permissive of the user's roles applies).
 *   - Global monthly cap across the whole system.
 * A request is refused BEFORE calling a provider if either cap is already hit;
 * actual usage is added AFTER the stream completes.
 */
@Injectable()
export class QuotaService {
  private readonly env = loadEnv();

  // Per-role overrides; unlisted roles use the default cap.
  private readonly roleCaps: Record<string, number> = {
    super_admin: Number.MAX_SAFE_INTEGER
  };

  constructor(@Inject(AI_REDIS) private readonly redis: Redis) {}

  private month(): string {
    // Avoid Date locale issues; YYYY-MM in UTC.
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  private roleKey(role: string, month: string) { return `ai:quota:role:${role}:${month}`; }
  private globalKey(month: string) { return `ai:quota:global:${month}`; }

  private capForRoles(roles: string[]): number {
    const caps = roles.map((r) => this.roleCaps[r] ?? this.env.AI_DEFAULT_ROLE_MONTHLY_TOKEN_CAP);
    return caps.length ? Math.max(...caps) : this.env.AI_DEFAULT_ROLE_MONTHLY_TOKEN_CAP;
  }
  private primaryRole(roles: string[]): string { return roles[0] ?? "default"; }

  /** Throws 403 if a cap is already exhausted. Call before streaming. */
  async assertWithinQuota(ctx: AuthContext): Promise<void> {
    const month = this.month();
    const [roleUsedRaw, globalUsedRaw] = await this.redis.mget(
      this.roleKey(this.primaryRole(ctx.roles), month), this.globalKey(month)
    );
    const roleUsed = Number(roleUsedRaw ?? 0);
    const globalUsed = Number(globalUsedRaw ?? 0);
    if (globalUsed >= this.env.AI_GLOBAL_MONTHLY_TOKEN_CAP)
      throw new ForbiddenException("Global monthly AI token budget exhausted");
    if (roleUsed >= this.capForRoles(ctx.roles))
      throw new ForbiddenException("Your role's monthly AI token quota is exhausted");
  }

  /** Record consumed tokens after a completed request. */
  async record(ctx: AuthContext, totalTokens: number): Promise<void> {
    const month = this.month();
    const ttl = 60 * 60 * 24 * 40; // ~40 days, safely past month end
    const pipe = this.redis.multi();
    pipe.incrby(this.roleKey(this.primaryRole(ctx.roles), month), totalTokens).expire(this.roleKey(this.primaryRole(ctx.roles), month), ttl, "NX");
    pipe.incrby(this.globalKey(month), totalTokens).expire(this.globalKey(month), ttl, "NX");
    await pipe.exec();
  }

  async view(ctx: AuthContext): Promise<AiQuotaView> {
    const month = this.month();
    const [roleUsed, globalUsed] = await this.redis.mget(
      this.roleKey(this.primaryRole(ctx.roles), month), this.globalKey(month)
    );
    return {
      roleCap: this.capForRoles(ctx.roles),
      roleUsed: Number(roleUsed ?? 0),
      globalCap: this.env.AI_GLOBAL_MONTHLY_TOKEN_CAP,
      globalUsed: Number(globalUsed ?? 0),
      periodMonth: month
    };
  }
}
