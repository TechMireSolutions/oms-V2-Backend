import { z, type ZodTypeAny } from "zod";
import type { FieldConfig, FieldType } from "@oms/dto";

export interface CompiledField {
  key: string;
  fieldType: FieldType;
  required: boolean;
  config: FieldConfig;
  writePermission?: string | null;
}

/**
 * Builds a runtime Zod schema from a set of published FieldDefinitions.
 * This is the server-side guarantee that user input written into a JSONB
 * custom_data column matches the SuperAdmin-defined contract — never trusting
 * the browser, which validates against the same definitions.
 */
export function buildFieldSchema(field: CompiledField): ZodTypeAny {
  const c = field.config ?? {};
  let schema: ZodTypeAny;

  switch (field.fieldType) {
    case "STRING":
    case "TEXT": {
      let s = z.string();
      if (c.minLength != null) s = s.min(c.minLength);
      if (c.maxLength != null) s = s.max(c.maxLength);
      if (c.pattern) s = s.regex(new RegExp(c.pattern));
      schema = s;
      break;
    }
    case "EMAIL":
      schema = z.string().email();
      break;
    case "PHONE":
      schema = z.string().regex(/^[+0-9 ()-]{6,40}$/, "invalid phone");
      break;
    case "NUMBER":
    case "INTEGER": {
      let n = field.fieldType === "INTEGER" ? z.number().int() : z.number();
      if (c.min != null) n = n.min(c.min);
      if (c.max != null) n = n.max(c.max);
      schema = n;
      break;
    }
    case "BOOLEAN":
      schema = z.boolean();
      break;
    case "DATE":
      schema = z.string().date();
      break;
    case "DATETIME":
      schema = z.string().datetime();
      break;
    case "SELECT": {
      const values = (c.options ?? []).map((o) => o.value);
      schema = values.length ? z.enum(values as [string, ...string[]]) : z.string();
      break;
    }
    case "MULTISELECT": {
      const values = (c.options ?? []).map((o) => o.value);
      const inner = values.length ? z.enum(values as [string, ...string[]]) : z.string();
      schema = z.array(inner);
      break;
    }
    case "JSON":
      schema = z.record(z.string(), z.unknown());
      break;
    default:
      schema = z.unknown();
  }

  // Optionality: required fields must be present; others may be omitted.
  if (!field.required) schema = schema.optional();
  return schema;
}

/**
 * Evaluate a field's conditional visibility against the (already-coerced) input.
 * A hidden field is neither required nor validated.
 */
export function isVisible(field: CompiledField, input: Record<string, unknown>): boolean {
  const cond = field.config?.visibleWhen;
  if (!cond) return true;
  return input[cond.field] === cond.equals;
}
