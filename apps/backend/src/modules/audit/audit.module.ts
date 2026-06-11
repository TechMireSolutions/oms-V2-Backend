import { Module } from "@nestjs/common";
import { IamModule } from "../iam";
import { AUDIT_CONTRACT } from "./contracts";
import { AuditController } from "./audit.controller";
import { AuditService } from "./audit.service";

@Module({
  imports: [IamModule],
  controllers: [AuditController],
  providers: [AuditService, { provide: AUDIT_CONTRACT, useExisting: AuditService }],
  exports: [AUDIT_CONTRACT]
})
export class AuditModule {}
