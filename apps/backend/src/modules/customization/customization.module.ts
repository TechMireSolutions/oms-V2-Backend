import { Module } from "@nestjs/common";
import { IamModule } from "../iam";
import { AuditModule, AUDIT_CONTRACT, type AuditContract } from "../audit";
import { CUSTOMISATION_CONTRACT } from "./contracts";
import { CustomizationController } from "./controllers/customization.controller";
import { ReportsController } from "./controllers/reports.controller";
import { CustomizationService } from "./services/customization.service";
import { ValidationService } from "./services/validation.service";
import { LockedCoreGuard } from "./services/locked-core";
import { AUDIT_PORT, type AuditPort } from "./ports";

@Module({
  imports: [IamModule, AuditModule],
  controllers: [CustomizationController, ReportsController],
  providers: [
    CustomizationService,
    ValidationService,
    LockedCoreGuard,
    { provide: CUSTOMISATION_CONTRACT, useExisting: CustomizationService },
    {
      provide: AUDIT_PORT,
      inject: [AUDIT_CONTRACT],
      useFactory: (audit: AuditContract): AuditPort => ({ logEvent: (i) => audit.logEvent(i) })
    }
  ],
  exports: [CUSTOMISATION_CONTRACT]
})
export class CustomizationModule {}
