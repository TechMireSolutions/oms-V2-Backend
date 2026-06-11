import { Module } from "@nestjs/common";
import { IamModule } from "../iam";
import { FINANCE_CONTRACT } from "./contracts";
import { FinanceController } from "./controllers/finance.controller";
import { FinanceService } from "./services/finance.service";
import { LedgerService } from "./services/ledger.service";

@Module({
  imports: [IamModule],
  controllers: [FinanceController],
  providers: [
    LedgerService,
    FinanceService,
    { provide: FINANCE_CONTRACT, useExisting: FinanceService }
  ],
  exports: [FINANCE_CONTRACT]
})
export class FinanceModule {}
