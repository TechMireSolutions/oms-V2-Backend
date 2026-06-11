import { Module } from "@nestjs/common";
import { IamModule } from "./modules/iam";
import { AdmissionsModule } from "./modules/admissions";
import { FinanceModule } from "./modules/finance";
import { CustomizationModule } from "./modules/customization";
import { AiModule } from "./modules/ai";
import { BrandingModule } from "./modules/branding";
import { AuditModule } from "./modules/audit";
import { NotificationModule } from "./modules/notification";
import { OperationsModule } from "./modules/operations/operations.module";
import { PolicyModule } from "./modules/policy/policy.module";
import { IntegrationModule } from "./modules/integration/integration.module";
import { ProjectTrackerModule } from "./modules/project-tracker/project-tracker.module";
import { HealthController } from "./health.controller";

// AppModule wires modules together. Each module imports ONLY another module's
// barrel (its contracts) — never its internals. Outbound-port bindings live in
// the consuming module (e.g. Admissions binds its FINANCE_PORT to FinanceContract).
@Module({
  imports: [
    IamModule, AuditModule, NotificationModule,
    FinanceModule, AdmissionsModule, CustomizationModule, AiModule, BrandingModule,
    OperationsModule, PolicyModule, IntegrationModule, ProjectTrackerModule
  ],
  controllers: [HealthController]
})
export class AppModule {}