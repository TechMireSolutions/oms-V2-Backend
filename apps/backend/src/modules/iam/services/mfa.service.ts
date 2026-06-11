import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { authenticator } from "otplib";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import type Redis from "ioredis";
import { loadEnv } from "@oms/config";
import { getPrismaClient } from "@oms/db";
import { REDIS } from "./redis.provider";

// AES-256-GCM field encryption for the TOTP shared secret.
// Key is derived from JWT_ACCESS_SECRET via scrypt; rotate together.
function aeadKey(): Buffer { return scryptSync(loadEnv().JWT_ACCESS_SECRET, "oms:mfa:v1", 32); }
function encrypt(plain: string): Buffer {
  const iv = randomBytes(12);
  const c  = createCipheriv("aes-256-gcm", aeadKey(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}
function decrypt(buf: Buffer): string {
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct  = buf.subarray(28);
  const d   = createDecipheriv("aes-256-gcm", aeadKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

@Injectable()
export class MfaService {
  private readonly prisma = getPrismaClient();
  constructor(@Inject(REDIS) private readonly redis: Redis) {
    authenticator.options = { window: 1, step: 30 };
  }

  /** Create a pending MFA challenge after a successful password step. */
  async issueChallenge(userId: string): Promise<string> {
    const challengeId = randomBytes(16).toString("hex");
    // 5-minute window; one challenge per user (overwrite).
    await this.redis.set(`auth:mfa:challenge:${challengeId}`, userId, "EX", 300);
    return challengeId;
  }

  async verifyChallenge(challengeId: string, code: string): Promise<string> {
    const userId = await this.redis.get(`auth:mfa:challenge:${challengeId}`);
    if (!userId) throw new UnauthorizedException("MFA challenge expired");

    const record = await this.prisma.mfaSecret.findUnique({ where: { userId } });
    if (!record) throw new UnauthorizedException("MFA not enrolled");
    const secret = decrypt(Buffer.from(record.secretEnc));

    // Replay protection: each accepted code is single-use within its window.
    const replayKey = `auth:mfa:used:${userId}:${code}`;
    if (await this.redis.exists(replayKey)) throw new UnauthorizedException("Code already used");

    if (!authenticator.check(code, secret)) throw new UnauthorizedException("Invalid MFA code");

    await this.redis.set(replayKey, "1", "EX", 90);
    await this.redis.del(`auth:mfa:challenge:${challengeId}`);
    return userId;
  }
}
