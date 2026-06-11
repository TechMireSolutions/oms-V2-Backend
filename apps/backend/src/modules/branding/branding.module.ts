import { Module } from "@nestjs/common";
import { IamModule } from "../iam";
import { AuditModule, AUDIT_CONTRACT, type AuditContract } from "../audit";
import { BRANDING_CONTRACT } from "./contracts";
import { BrandingController } from "./controllers/branding.controller";
import { BrandingService } from "./services/branding.service";
import { brandingRedisProvider } from "./services/redis.provider";
import { AUDIT_PORT, type AuditPort } from "./ports";

@Module({
  imports: [IamModule, AuditModule],
  controllers: [BrandingController],
  providers: [
    brandingRedisProvider,
    BrandingService,
    { provide: BRANDING_CONTRACT, useExisting: BrandingService },
    {
      provide: AUDIT_PORT,
      inject: [AUDIT_CONTRACT],
      useFactory: (audit: AuditContract): AuditPort => ({ logEvent: (i) => audit.logEvent(i) })
    }
  ],
  exports: [BRANDING_CONTRACT]
})
export class BrandingModule {}
