// IAM contracts — the ONLY public surface other modules may consume.
// Every contract method takes an AuthContext (zero-trust: receiver re-checks).
import type { AuthContext } from "@oms/dto";

export const IAM_CONTRACT = Symbol("IAM_CONTRACT");

export interface IamContract {
  /** Verify a short-lived JWT access token; throws if invalid/expired/revoked. */
  validateAccessToken(token: string): Promise<AuthContext>;

  /** Pure permission check; modules call this from inside their own guards. */
  checkPermission(ctx: AuthContext, permission: string): Promise<boolean>;

  /** Revoke a refresh token (immediate, server-side). */
  revokeRefreshToken(token: string, reason: string): Promise<void>;
}
