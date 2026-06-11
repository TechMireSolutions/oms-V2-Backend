import {
  BadRequestException, Body, Controller, HttpCode, HttpException, HttpStatus, Ip, Post, Req,
  UnauthorizedException
} from "@nestjs/common";
import { getPrismaClient } from "@oms/db";
import {
  LoginRequestSchema, LoginResponseSchema, MfaVerifyRequestSchema,
  RefreshRequestSchema, TokenPairSchema,
  type LoginResponse, type TokenPair
} from "@oms/dto";
import { Public } from "../decorators";
import { BruteForceService } from "../services/bruteforce.service";
import { IamService } from "../services/iam.service";
import { MfaService } from "../services/mfa.service";
import { PasswordService } from "../services/password.service";
import { TokenService } from "../services/token.service";

@Controller("auth")
export class AuthController {
  private readonly prisma = getPrismaClient();

  constructor(
    private readonly iam: IamService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly mfa: MfaService,
    private readonly bruteForce: BruteForceService
  ) {}

  // ── POST /auth/login ─────────────────────────────────────────────────
  @Public()
  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: any, @Ip() ip: string): Promise<LoginResponse> {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Invalid login payload");
    const { email, password } = parsed.data;
    const ua = req.headers["user-agent"] as string | undefined;

    const lock = await this.bruteForce.check(email, ip);
    if (lock.locked) {
      await this.audit(email, ip, ua, null, "RATE_LIMITED", lock.reason);
      throw new HttpException("Too many attempts; try again later", HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.prisma.user.findUnique({ where: { email } });

    // Run hash verify even on unknown users to keep timing constant.
    const ok = user
      ? await this.passwords.verify(user.passwordHash, password)
      : await this.passwords.verify("$argon2id$v=19$m=65536,t=3,p=1$AAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", password);

    if (!user || !ok) {
      await this.bruteForce.recordFailure(email, ip);
      await this.audit(email, ip, ua, user?.id ?? null, "BAD_CREDENTIALS");
      throw new UnauthorizedException("Invalid credentials");
    }
    this.iam.ensureUserActive(user);

    // Transparent rehash if Argon parameters drifted.
    if (this.passwords.needsRehash(user.passwordHash)) {
      const newHash = await this.passwords.hash(password);
      await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });
    }

    // If MFA is enrolled, return a challenge instead of tokens.
    if (user.mfaEnrolled) {
      const challengeId = await this.mfa.issueChallenge(user.id);
      await this.audit(email, ip, ua, user.id, "MFA_REQUIRED");
      return LoginResponseSchema.parse({ mfaRequired: true, challengeId });
    }

    await this.bruteForce.recordSuccess(email, ip);
    await this.audit(email, ip, ua, user.id, "SUCCESS");
    const pair = await this.issueTokenPair(user.id, ua, ip);
    return LoginResponseSchema.parse({ mfaRequired: false, ...pair });
  }

  // ── POST /auth/mfa/verify ────────────────────────────────────────────
  @Public()
  @Post("mfa/verify")
  @HttpCode(200)
  async verifyMfa(@Body() body: unknown, @Req() req: any, @Ip() ip: string): Promise<TokenPair> {
    const parsed = MfaVerifyRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Invalid MFA payload");
    const ua = req.headers["user-agent"] as string | undefined;

    let userId: string;
    try {
      userId = await this.mfa.verifyChallenge(parsed.data.challengeId, parsed.data.code);
    } catch (e) {
      const user = await this.prisma.user.findFirst({ where: { mfaSecret: { isNot: null } } }); // best-effort for audit
      await this.bruteForce.recordFailure(user?.email ?? "unknown", ip);
      await this.audit(user?.email ?? "unknown", ip, ua, user?.id ?? null, "MFA_FAILED");
      throw e;
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    this.iam.ensureUserActive(user);
    await this.bruteForce.recordSuccess(user!.email, ip);
    await this.audit(user!.email, ip, ua, userId, "SUCCESS");
    return TokenPairSchema.parse(await this.issueTokenPair(userId, ua, ip));
  }

  // ── POST /auth/refresh ───────────────────────────────────────────────
  @Public()
  @Post("refresh")
  @HttpCode(200)
  async refresh(@Body() body: unknown, @Req() req: any, @Ip() ip: string): Promise<TokenPair> {
    const parsed = RefreshRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Invalid refresh payload");
    const ua = req.headers["user-agent"] as string | undefined;

    const { userId } = await this.tokens.consumeRefreshToken(parsed.data.refreshToken);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    this.iam.ensureUserActive(user);
    return TokenPairSchema.parse(await this.issueTokenPair(userId, ua, ip));
  }

  // ── POST /auth/logout ────────────────────────────────────────────────
  @Post("logout")
  @HttpCode(204)
  async logout(@Body() body: unknown): Promise<void> {
    const parsed = RefreshRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Invalid payload");
    await this.tokens.revokeRefreshToken(parsed.data.refreshToken, "logout");
  }

  // ── helpers ──────────────────────────────────────────────────────────
  private async issueTokenPair(userId: string, userAgent: string | undefined, ip: string): Promise<TokenPair> {
    const [roles, perms] = await Promise.all([this.iam.loadRoles(userId), this.iam.loadPermissions(userId)]);
    const { token: accessToken, expiresIn } = this.tokens.signAccessToken({
      sub: userId, roles, permHash: this.iam.permHash(perms)
    });
    const refreshToken = await this.tokens.issueRefreshToken({ userId, userAgent, ipAddress: ip });
    return { accessToken, refreshToken, accessExpiresIn: expiresIn };
  }

  private async audit(
    email: string, ip: string, ua: string | undefined, userId: string | null,
    outcome: "SUCCESS" | "BAD_CREDENTIALS" | "MFA_REQUIRED" | "MFA_FAILED" | "LOCKED" | "RATE_LIMITED" | "DISABLED",
    reason?: string
  ) {
    await this.prisma.loginAttempt.create({
      data: { email, ipAddress: ip, userAgent: ua, userId: userId ?? undefined, outcome, reason }
    });
  }
}
