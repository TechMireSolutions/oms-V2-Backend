import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { IAM_CONTRACT } from "./contracts";
import { AuthController } from "./controllers/auth.controller";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { PermissionsGuard } from "./guards/permissions.guard";
import { BruteForceService } from "./services/bruteforce.service";
import { IamService } from "./services/iam.service";
import { MfaService } from "./services/mfa.service";
import { PasswordService } from "./services/password.service";
import { redisProvider } from "./services/redis.provider";
import { TokenService } from "./services/token.service";

@Module({
  controllers: [AuthController],
  providers: [
    redisProvider,
    IamService,
    TokenService,
    PasswordService,
    MfaService,
    BruteForceService,
    { provide: IAM_CONTRACT, useExisting: IamService },
    // Apply guards GLOBALLY so every route is authenticated unless @Public(),
    // and any route can use @RequirePermissions(...) for fine-grained checks.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard }
  ],
  exports: [IAM_CONTRACT]
})
export class IamModule {}
