import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IAM_CONTRACT, type IamContract } from "../contracts";
import { PUBLIC_KEY } from "../decorators";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(IAM_CONTRACT) private readonly iam: IamContract
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const header = req.headers["authorization"] as string | undefined;
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException("Missing bearer token");

    const token = header.slice(7).trim();
    try {
      req.authContext = await this.iam.validateAccessToken(token);
    } catch {
      throw new UnauthorizedException("Invalid or expired access token");
    }
    return true;
  }
}
