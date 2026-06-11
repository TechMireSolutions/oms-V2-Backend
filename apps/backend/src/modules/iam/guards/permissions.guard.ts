import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthContext } from "@oms/dto";
import { IAM_CONTRACT, type IamContract } from "../contracts";
import { PERMISSIONS_KEY } from "../decorators";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(IAM_CONTRACT) private readonly iam: IamContract
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!required?.length) return true;

    const req = context.switchToHttp().getRequest();
    const auth = req.authContext as AuthContext | undefined;
    if (!auth) throw new ForbiddenException("Unauthenticated");

    // ALL required permissions must be present (delegated to IAM for ABAC hooks).
    for (const perm of required) {
      const ok = await this.iam.checkPermission(auth, perm);
      if (!ok) throw new ForbiddenException(`Missing permission: ${perm}`);
    }
    return true;
  }
}
