import { SetMetadata, createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthContext } from "@oms/dto";

export const PERMISSIONS_KEY = "oms:required-permissions";
export const PUBLIC_KEY      = "oms:public-route";

/** Mark a route as not requiring authentication. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Require ALL of the listed permissions to access this route. */
export const RequirePermissions = (...perms: string[]) => SetMetadata(PERMISSIONS_KEY, perms);

/** Inject the authenticated AuthContext into a handler argument. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest();
    const auth = req.authContext as AuthContext | undefined;
    if (!auth) throw new Error("AuthContext missing — JwtAuthGuard not applied");
    return auth;
  }
);
