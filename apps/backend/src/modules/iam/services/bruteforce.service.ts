import { Inject, Injectable } from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS } from "./redis.provider";

/**
 * Redis-backed sliding lockout for /auth/* endpoints.
 *
 * Strategy: dual-bucket — per-email AND per-IP. A failure increments both
 * counters with a fixed TTL window; once either trips the threshold, the
 * key is set to a lock for `lockSeconds`. Both must be checked on each
 * attempt, so an attacker can't bypass via IP rotation OR account spraying.
 */
@Injectable()
export class BruteForceService {
  // Tunables (override via env if needed).
  private readonly windowSeconds = 600;     // 10-minute rolling window
  private readonly emailMax      = 5;       // per-email failures before lock
  private readonly ipMax         = 20;      // per-IP failures before lock
  private readonly lockSeconds   = 900;     // 15-minute lock

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private kEmail(e: string) { return `auth:bf:email:${e.toLowerCase()}`; }
  private kIp(ip: string)   { return `auth:bf:ip:${ip}`; }
  private kLockEmail(e: string) { return `auth:lock:email:${e.toLowerCase()}`; }
  private kLockIp(ip: string)   { return `auth:lock:ip:${ip}`; }

  /**
   * Throws nothing; callers check `.locked`. If Redis is unavailable the gate
   * fails OPEN (not locked) so authentication still works in environments
   * without Redis — the durable LoginAttempt audit trail is unaffected.
   */
  async check(email: string, ip: string): Promise<{ locked: boolean; reason?: string }> {
    try {
      const [lockE, lockI] = await this.redis.mget(this.kLockEmail(email), this.kLockIp(ip));
      if (lockE) return { locked: true, reason: "email-locked" };
      if (lockI) return { locked: true, reason: "ip-locked" };
    } catch { /* Redis down — fail open */ }
    return { locked: false };
  }

  async recordFailure(email: string, ip: string): Promise<void> {
    try {
      const pipe = this.redis.multi();
      pipe.incr(this.kEmail(email)).expire(this.kEmail(email), this.windowSeconds, "NX");
      pipe.incr(this.kIp(ip)).expire(this.kIp(ip),       this.windowSeconds, "NX");
      const res = await pipe.exec();
      if (!res) return;
      const emailCount = Number(res[0]?.[1] ?? 0);
      const ipCount    = Number(res[2]?.[1] ?? 0);
      if (emailCount >= this.emailMax) await this.redis.set(this.kLockEmail(email), "1", "EX", this.lockSeconds);
      if (ipCount    >= this.ipMax)    await this.redis.set(this.kLockIp(ip),       "1", "EX", this.lockSeconds);
    } catch { /* Redis down — skip lockout accounting */ }
  }

  async recordSuccess(email: string, ip: string): Promise<void> {
    try { await this.redis.del(this.kEmail(email), this.kIp(ip)); } catch { /* ignore */ }
  }
}
