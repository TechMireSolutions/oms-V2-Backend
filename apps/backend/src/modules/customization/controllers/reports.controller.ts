import { Controller, Get, Param } from "@nestjs/common";
import type { ReportResult } from "@oms/dto";
import { Public } from "../../iam";

// Minimal Report run endpoint (Part M). In a full build this compiles a
// ReportDefinition against the semantic metric layer with the caller's security
// context. For the running demo it serves governed sample datasets per key so
// the dashboard renders live widgets.
@Controller("meta/reports")
export class ReportsController {
  @Public()
  @Get(":key/run")
  run(@Param("key") key: string): ReportResult {
    switch (key) {
      case "welfare-approvals-kpi":
        return { rows: [{ count: 128 }], value: 128 };
      case "applications-kpi":
        return { rows: [{ count: 342 }], value: 342 };
      case "pending-journals-kpi":
        return { rows: [{ count: 7 }], value: 7 };
      case "budget-gauge":
        return { rows: [{ value: 72 }], value: 72 };
      case "welfare-spend-by-month":
        return {
          rows: [
            { month: "Jan", subsidy: 42000, waiver: 18000 },
            { month: "Feb", subsidy: 51000, waiver: 21000 },
            { month: "Mar", subsidy: 47500, waiver: 19500 },
            { month: "Apr", subsidy: 61000, waiver: 24000 },
            { month: "May", subsidy: 58000, waiver: 26500 },
            { month: "Jun", subsidy: 67000, waiver: 28000 }
          ]
        };
      case "applications-trend":
        return {
          rows: [
            { week: "W1", received: 40, accepted: 22 },
            { week: "W2", received: 55, accepted: 31 },
            { week: "W3", received: 48, accepted: 27 },
            { week: "W4", received: 70, accepted: 44 }
          ]
        };
      case "finance-trial-balance":
        return {
          rows: [
            { code: "1000", name: "Cash", debit: "250,000.00", credit: "0.00" },
            { code: "1100", name: "Accounts Receivable", debit: "84,000.00", credit: "0.00" },
            { code: "4000", name: "Tuition Revenue", debit: "0.00", credit: "210,000.00" },
            { code: "4000-CSR", name: "CSR Funding", debit: "0.00", credit: "90,000.00" },
            { code: "5200-WELFARE", name: "Welfare Expense", debit: "56,000.00", credit: "0.00" },
            { code: "2100-WELFARE-PAYABLE", name: "Welfare Payable", debit: "0.00", credit: "90,000.00" }
          ]
        };
      case "finance-kpi-revenue":
        return { rows: [{ value: 300000 }], value: 300000 };
      case "finance-kpi-receivable":
        return { rows: [{ value: 84000 }], value: 84000 };
      case "recent-welfare":
        return {
          rows: [
            { reference: "WEL-2026-000341", type: "SUBSIDY", status: "RECOMMENDED", amount: "12,000" },
            { reference: "WEL-2026-000340", type: "FEE_WAIVER", status: "APPROVED", amount: "8,500" },
            { reference: "WEL-2026-000339", type: "HARDSHIP_GRANT", status: "SUBMITTED", amount: "20,000" },
            { reference: "WEL-2026-000338", type: "SUBSIDY", status: "APPROVED", amount: "15,000" }
          ]
        };
      default:
        return { rows: [], value: null };
    }
  }
}
