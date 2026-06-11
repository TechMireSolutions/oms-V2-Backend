import { z } from "zod";

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(256)
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  mfaRequired: z.boolean(),
  mfaChallengeId: z.string().uuid().optional()
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const MfaVerifyRequestSchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/)
});
export type MfaVerifyRequest = z.infer<typeof MfaVerifyRequestSchema>;

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(20)
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const TokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  accessExpiresIn: z.number().int().positive()
});
export type TokenPair = z.infer<typeof TokenPairSchema>;

export const AccessTokenClaimsSchema = z.object({
  sub: z.string().uuid(),       // userId
  roles: z.array(z.string()),   // role keys
  permHash: z.string(),         // sha256 of sorted permission list (fast change detection)
  locId: z.string().uuid().optional(),
  iat: z.number().int(),
  exp: z.number().int(),
  jti: z.string().uuid()
});
export type AccessTokenClaims = z.infer<typeof AccessTokenClaimsSchema>;
