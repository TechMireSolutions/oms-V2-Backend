import { z } from "zod";
import { UuidSchema } from "./common";

export const WidgetTypeSchema = z.enum(["kpi", "bar", "line", "gauge", "table", "list"]);
export type WidgetType = z.infer<typeof WidgetTypeSchema>;

// Binds a widget to a data source (a ReportDefinition) + display options.
export const WidgetDefinitionSchema = z.object({
  id: z.string(),
  type: WidgetTypeSchema,
  title: z.string(),
  // Report whose run endpoint feeds this widget: /meta/reports/{reportKey}/run
  reportKey: z.string().optional(),
  // RBAC permission required to view this widget (per-widget gating, Part M).
  requiredPermission: z.string().optional(),
  refreshSeconds: z.number().int().min(5).max(3600).default(60),
  options: z.object({
    // KPI / gauge
    valueKey: z.string().optional(),
    unit: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    thresholds: z.array(z.object({ at: z.number(), color: z.string() })).optional(),
    // charts
    xKey: z.string().optional(),
    series: z.array(z.object({ key: z.string(), label: z.string(), color: z.string().optional() })).optional(),
    // table/list
    columns: z.array(z.object({ key: z.string(), label: z.string() })).optional()
  }).default({})
});
export type WidgetDefinition = z.infer<typeof WidgetDefinitionSchema>;

// Grid placement for one widget.
export const GridItemSchema = z.object({
  widgetId: z.string(),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1),
  minW: z.number().int().min(1).optional(),
  minH: z.number().int().min(1).optional()
});

export const DashboardLayoutSchema = z.object({
  id: UuidSchema,
  key: z.string(),
  name: z.string(),
  // Scope: a role key or a specific user (Part M — dashboards scoped per role/user).
  scopeRole: z.string().optional(),
  cols: z.number().int().min(1).max(24).default(12),
  rowHeight: z.number().int().min(20).max(200).default(80),
  items: z.array(GridItemSchema),
  widgets: z.array(WidgetDefinitionSchema)
});
export type DashboardLayout = z.infer<typeof DashboardLayoutSchema>;

// Shape returned by /meta/reports/{key}/run
export const ReportResultSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).default([]),
  // Convenience scalar for single-value widgets (KPI/gauge).
  value: z.number().nullable().optional()
});
export type ReportResult = z.infer<typeof ReportResultSchema>;
