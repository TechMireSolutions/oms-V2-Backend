import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { getPrismaClient } from "@oms/db";
import type { AuthContext } from "@oms/dto";
import type { IamContract } from "../contracts";
import { TokenService } from "./token.service";

@Injectable()
export class IamService implements IamContract {
  private readonly prisma = getPrismaClient();
  // Tiny LRU per process — perm sets change rarely. Invalidated on role changes
  // by bumping the user's `permHash` (forces clients to re-auth via refresh).
  private readonly permCache = new Map<string, { hash: string; perms: Set<string> }>();

  constructor(private readonly tokens: TokenService) {}

  async validateAccessToken(token: string): Promise<AuthContext> {
    return this.tokens.verifyAccessToken(token);
  }

  async checkPermission(ctx: AuthContext, permission: string): Promise<boolean> {
    if (ctx.roles.includes("super_admin")) return true; // SuperAdmin bypass

    let entry = this.permCache.get(ctx.userId);
    if (!entry) {
      const perms = await this.loadPermissions(ctx.userId);
      entry = { hash: this.permHash(perms), perms };
      this.permCache.set(ctx.userId, entry);
    }
    return entry.perms.has(permission);
  }

  async revokeRefreshToken(token: string, reason: string): Promise<void> {
    await this.tokens.revokeRefreshToken(token, reason);
  }

  // ── Internal helpers used by the AuthController ───────────────────────
  async loadPermissions(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      select: { role: { select: { permissions: { select: { permission: { select: { key: true } } } } } } }
    });
    const set = new Set<string>();
    for (const r of rows) for (const rp of r.role.permissions) set.add(rp.permission.key);
    return set;
  }

  async loadRoles(userId: string): Promise<string[]> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId }, select: { role: { select: { key: true } } }
    });
    return Array.from(new Set(rows.map(r => r.role.key)));
  }

  permHash(perms: Set<string>): string {
    return createHash("sha256").update([...perms].sort().join("\n")).digest("hex").slice(0, 16);
  }

  invalidatePermCache(userId: string) { this.permCache.delete(userId); }

  ensureUserActive(userOrNull: { isActive: boolean; lockedUntil: Date | null } | null) {
    if (!userOrNull) throw new UnauthorizedException("Invalid credentials");
    if (!userOrNull.isActive) throw new UnauthorizedException("Account disabled");
    if (userOrNull.lockedUntil && userOrNull.lockedUntil > new Date())
      throw new UnauthorizedException("Account locked");
  }
}
