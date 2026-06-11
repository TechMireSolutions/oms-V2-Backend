import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type Redis from "ioredis";
import { loadEnv } from "@oms/config";
import { getPrismaClient } from "@oms/db";
import { AccessTokenClaimsSchema, type AccessTokenClaims, type AuthContext } from "@oms/dto";
import { REDIS } from "./redis.provider";

/**
 * Hybrid session model:
 *  - Short-lived JWT access token: fast, stateless, carries RBAC claims.
 *  - Opaque refresh token: server-side, hashed-at-rest, immediately revocable via Redis.
 *
 * Access tokens are NOT individually revocable; the JWT's `permHash` lets clients
 * detect a roles/permissions change and force a refresh.
 */
@Injectable()
export class TokenService {
  private readonly env = loadEnv();
  private readonly prisma = getPrismaClient();

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  // ── Access tokens (JWT) ───────────────────────────────────────────────
  signAccessToken(claims: Omit<AccessTokenClaims, "iat" | "exp" | "jti">): { token: string; expiresIn: number } {
    const jti = randomUUID();
    const token = jwt.sign({ ...claims, jti }, this.env.JWT_ACCESS_SECRET, {
      algorithm: "HS256",
      expiresIn: this.env.JWT_ACCESS_TTL_SECONDS
    });
    return { token, expiresIn: this.env.JWT_ACCESS_TTL_SECONDS };
  }

  verifyAccessToken(token: string): AuthContext {
    let payload: unknown;
    try {
      payload = jwt.verify(token, this.env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] });
    } catch {
      throw new UnauthorizedException("Invalid access token");
    }
    const parsed = AccessTokenClaimsSchema.safeParse(payload);
    if (!parsed.success) throw new UnauthorizedException("Malformed access token");
    const c = parsed.data;
    return {
      userId: c.sub,
      roles: c.roles,
      permissions: [],                 // perms hydrated lazily on permission check
      locationId: c.locId
    };
  }

  // ── Refresh tokens (opaque) ───────────────────────────────────────────
  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
  private redisKey(hash: string): string { return `auth:refresh:${hash}`; }

  async issueRefreshToken(opts: {
    userId: string;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<string> {
    const token = randomBytes(48).toString("base64url");
    const tokenHash = this.hashToken(token);
    const ttl = this.env.JWT_REFRESH_TTL_SECONDS;
    const expiresAt = new Date(Date.now() + ttl * 1000);

    await this.prisma.refreshSession.create({
      data: {
        userId: opts.userId,
        tokenHash,
        userAgent: opts.userAgent,
        ipAddress: opts.ipAddress,
        expiresAt
      }
    });
    // Redis is the fast-path revocation cache; the DB row is the durable record.
    // If Redis is down we still issue the token (DB-backed).
    try { await this.redis.set(this.redisKey(tokenHash), opts.userId, "EX", ttl); } catch { /* ignore */ }
    return token;
  }

  async consumeRefreshToken(token: string): Promise<{ userId: string; tokenHash: string }> {
    const tokenHash = this.hashToken(token);

    // Prefer Redis; fall back to the DB record when Redis is unavailable.
    let owner: string | null = null;
    try { owner = await this.redis.get(this.redisKey(tokenHash)); } catch { owner = null; }
    if (!owner) {
      const session = await this.prisma.refreshSession.findFirst({
        where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } }
      });
      if (!session) throw new UnauthorizedException("Refresh token revoked or expired");
      owner = session.userId;
    }

    // Rotate: invalidate the old hash immediately (reuse detection).
    try { await this.redis.del(this.redisKey(tokenHash)); } catch { /* ignore */ }
    await this.prisma.refreshSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data:  { revokedAt: new Date(), revokedReason: "rotated" }
    });
    return { userId: owner, tokenHash };
  }

  async revokeRefreshToken(token: string, reason: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    try { await this.redis.del(this.redisKey(tokenHash)); } catch { /* ignore */ }
    await this.prisma.refreshSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data:  { revokedAt: new Date(), revokedReason: reason }
    });
  }

  async revokeAllForUser(userId: string, reason: string): Promise<void> {
    const sessions = await this.prisma.refreshSession.findMany({
      where: { userId, revokedAt: null }, select: { tokenHash: true }
    });
    if (sessions.length) {
      await this.redis.del(...sessions.map(s => this.redisKey(s.tokenHash)));
      await this.prisma.refreshSession.updateMany({
        where: { userId, revokedAt: null },
        data:  { revokedAt: new Date(), revokedReason: reason }
      });
    }
  }
}
