// Public barrel for the Admissions & Welfare module.
// Exposes the module class, the contract token + interface, the outbound port
// tokens (so wiring modules can bind Finance/Notification/Audit), and the
// permission registry. Services, controllers, and DB models stay internal.
export { AdmissionsModule } from "./admissions.module";
export * from "./contracts";
export {
  FINANCE_PORT, NOTIFICATION_PORT, AUDIT_PORT,
  type FinancePort, type NotificationPort, type AuditPort
} from "./ports";
