import { z } from "zod";
import { UuidSchema } from "./common";

export const FieldTypeSchema = z.enum([
  "STRING", "TEXT", "NUMBER", "INTEGER", "BOOLEAN", "DATE", "DATETIME",
  "EMAIL", "PHONE", "SELECT", "MULTISELECT", "JSON"
]);
export type FieldType = z.infer<typeof FieldTypeSchema>;

export const DefinitionStatusSchema = z.enum([
  "DRAFT", "PREVIEW", "PUBLISHED", "SUPERSEDED", "ARCHIVED"
]);
export type DefinitionStatus = z.infer<typeof DefinitionStatusSchema>;

// Conditional visibility: show this field only when another field matches.
export const ConditionSchema = z.object({
  field: z.string(),
  equals: z.unknown()
});

// Validation rules carried in FieldDefinition.config — interpreted by the
// server-side validation engine to build a runtime Zod schema.
export const FieldConfigSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().nonnegative().optional(),
  pattern: z.string().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  default: z.unknown().optional(),
  visibleWhen: ConditionSchema.optional()
}).strict();
export type FieldConfig = z.infer<typeof FieldConfigSchema>;

// ── Authoring payloads ────────────────────────────────────────────────
export const CreateFieldDefinitionSchema = z.object({
  entityType: z.string().min(1).max(80),
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "must be a valid identifier").max(80),
  label: z.string().min(1).max(200),
  fieldType: FieldTypeSchema,
  config: FieldConfigSchema.default({}),
  uiSchema: z.record(z.string(), z.unknown()).default({}),
  required: z.boolean().default(false),
  readPermission: z.string().max(120).optional(),
  writePermission: z.string().max(120).optional()
});
export type CreateFieldDefinition = z.infer<typeof CreateFieldDefinitionSchema>;

export const FormSectionSchema = z.object({
  title: z.string().max(200),
  fields: z.array(z.string()).min(1),     // FieldDefinition keys
  columns: z.number().int().min(1).max(4).default(1)
});
export const CreateFormDefinitionSchema = z.object({
  entityType: z.string().min(1).max(80),
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/).max(80),
  title: z.string().min(1).max(200),
  sections: z.array(FormSectionSchema).min(1),
  uiSchema: z.record(z.string(), z.unknown()).default({})
});
export type CreateFormDefinition = z.infer<typeof CreateFormDefinitionSchema>;

export const LifecycleActionSchema = z.enum(["PROMOTE_PREVIEW", "PUBLISH", "ARCHIVE", "ROLLBACK"]);
export type LifecycleAction = z.infer<typeof LifecycleActionSchema>;

export const TransitionRequestSchema = z.object({
  action: LifecycleActionSchema,
  // For ROLLBACK: the prior version id to re-publish.
  targetVersionId: UuidSchema.optional(),
  note: z.string().max(500).optional()
});
export type TransitionRequest = z.infer<typeof TransitionRequestSchema>;

// ── Views ─────────────────────────────────────────────────────────────
export const DefinitionViewSchema = z.object({
  id: UuidSchema,
  kind: z.enum(["field", "form"]),
  entityType: z.string(),
  key: z.string(),
  version: z.number().int(),
  status: DefinitionStatusSchema,
  publishedAt: z.string().nullable()
});
export type DefinitionView = z.infer<typeof DefinitionViewSchema>;

// Result of validating runtime input against a published form.
export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  // Sanitised values to persist into custom_data (only known, permitted fields).
  data: z.record(z.string(), z.unknown()).optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional()
});
export type ValidationResult = z.infer<typeof ValidationResultSchema>;
