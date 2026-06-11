import { Module } from "@nestjs/common";
import { IamModule } from "../iam";
import { FinanceModule, FINANCE_CONTRACT, type FinanceContract } from "../finance";
import { AuditModule, AUDIT_CONTRACT, type AuditContract } from "../audit";
import { NotificationModule, NOTIFICATION_CONTRACT, type NotificationContract } from "../notification";
import { ADMISSIONS_CONTRACT } from "./contracts";
import { AdmissionsController } from "./controllers/admissions.controller";
import { AdmissionsService } from "./services/admissions.service";
import { fieldCipherProvider } from "./services/field-cipher.provider";
import { FINANCE_PORT, AUDIT_PORT, NOTIFICATION_PORT, type FinancePort, type AuditPort, type NotificationPort } from "./ports";

@Module({
  imports: [IamModule, FinanceModule, AuditModule, NotificationModule],
  controllers: [AdmissionsController],
  providers: [
    fieldCipherProvider,
    AdmissionsService,
    { provide: ADMISSIONS_CONTRACT, useExisting: AdmissionsService },
    {
      provide: FINANCE_PORT,
      inject: [FINANCE_CONTRACT],
      useFactory: (finance: FinanceContract): FinancePort => ({
        postWelfareSubsidy: (ctx, input) => finance.postWelfareSubsidy(ctx, input)
      })
    },
    {
      provide: AUDIT_PORT,
      inject: [AUDIT_CONTRACT],
      useFactory: (audit: AuditContract): AuditPort => ({ logEvent: (i) => audit.logEvent(i) })
    },
    {
      provide: NOTIFICATION_PORT,
      inject: [NOTIFICATION_CONTRACT],
      useFactory: (n: NotificationContract): NotificationPort => ({ notify: (ctx, i) => n.notify(ctx, i) })
    }
  ],
  exports: [ADMISSIONS_CONTRACT]
})
export class AdmissionsModule {}
