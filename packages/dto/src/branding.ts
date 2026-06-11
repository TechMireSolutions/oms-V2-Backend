import { z } from "zod";
import { UuidSchema } from "./common";

// Hex or rgb(a) color — never arbitrary CSS (injection-safe allow-list).
const ColorSchema = z.string().regex(
  /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$|^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/,
  "must be a hex or rgb(a) color"
);
// Length token like "6px", "0.5rem".
const LengthSchema = z.string().regex(/^\d+(?:\.\d+)?(?:px|rem|em|%)$/);

export const ThemeTokensSchema = z.object({
  colors: z.object({
    primary: ColorSchema,
    secondary: ColorSchema.optional(),
    accent: ColorSchema.optional(),
    bg: ColorSchema.optional(),
    fg: ColorSchema.optional(),
    success: ColorSchema.optional(),
    warning: ColorSchema.optional(),
    danger: ColorSchema.optional()
  }),
  radius: z.object({
    base: LengthSchema.default("6px"),
    sm: LengthSchema.optional(),
    lg: LengthSchema.optional()
  }).default({ base: "6px" }),
  typography: z.object({
    fontBase: z.string().max(120).default("Inter, ui-sans-serif, system-ui, sans-serif"),
    scale: z.number().min(1).max(2).default(1.25)
  }).default({ fontBase: "Inter, ui-sans-serif, system-ui, sans-serif", scale: 1.25 }),
  mode: z.enum(["light", "dark"]).default("light")
});
export type ThemeTokens = z.infer<typeof ThemeTokensSchema>;

export const BrandImagerySchema = z.object({
  logoLight: z.string().max(500).optional(),
  logoDark: z.string().max(500).optional(),
  favicon: z.string().max(500).optional(),
  loginBackground: z.string().max(500).optional(),
  emailHeader: z.string().max(500).optional()
});
export type BrandImagery = z.infer<typeof BrandImagerySchema>;

export const BrandScopeSchema = z.enum(["GLOBAL", "LOCATION"]);

// Authoring payload (creates a DRAFT brand version).
export const UpsertBrandSchema = z.object({
  scope: BrandScopeSchema.default("GLOBAL"),
  locationId: UuidSchema.optional(),
  appName: z.string().min(1).max(120),
  tagline: z.string().max(200).optional(),
  footerText: z.string().max(300).optional(),
  imagery: BrandImagerySchema.default({}),
  tokens: ThemeTokensSchema
}).refine((v) => v.scope === "GLOBAL" || !!v.locationId, {
  message: "locationId is required when scope = LOCATION"
});
export type UpsertBrand = z.infer<typeof UpsertBrandSchema>;

// The compact payload served to the frontend for runtime theming.
export const ActiveBrandSchema = z.object({
  id: UuidSchema,
  scope: BrandScopeSchema,
  version: z.number().int(),
  appName: z.string(),
  tagline: z.string().nullable(),
  footerText: z.string().nullable(),
  imagery: BrandImagerySchema,
  tokens: ThemeTokensSchema,
  // ETag-like fingerprint for client/CDN caching.
  etag: z.string()
});
export type ActiveBrand = z.infer<typeof ActiveBrandSchema>;

export const BrandViewSchema = z.object({
  id: UuidSchema,
  scope: BrandScopeSchema,
  version: z.number().int(),
  status: z.enum(["DRAFT", "PREVIEW", "PUBLISHED", "SUPERSEDED", "ARCHIVED"]),
  appName: z.string(),
  publishedAt: z.string().nullable()
});
export type BrandView = z.infer<typeof BrandViewSchema>;
