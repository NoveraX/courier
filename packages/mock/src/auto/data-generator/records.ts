/**
 * Top-level record generation from schema objects.
 */

import type { FieldMeta } from "../schema-introspect";
import { analyzeField, extractShape, unwrapArraySchema } from "../schema-introspect";

import { detectEntityContext, generateFallbackRecords } from "./context";
import { generateValue } from "./value";

/** Generate N records from a schema */
export function generateRecords(
  schema: unknown,
  count: number,
  startId = 1,
): Record<string, unknown>[] {
  const itemSchema = unwrapArraySchema(schema) ?? schema;
  const shape = extractShape(itemSchema);
  if (!shape) return generateFallbackRecords(count, startId);

  const fieldKeys = Object.keys(shape);
  const fields = new Map<string, FieldMeta>();
  for (const [key, field] of Object.entries(shape)) {
    fields.set(key, analyzeField(field));
  }

  const context = detectEntityContext(fieldKeys);

  return Array.from({ length: count }, (_, i) => {
    const record: Record<string, unknown> = {};
    const index = startId + i;

    for (const [key, meta] of fields) {
      record[key] = generateValue(key, meta, index, context);
    }

    return record;
  });
}

/** Generate a single record from a schema */
export function generateRecord(schema: unknown, index = 1): Record<string, unknown> {
  return generateRecords(schema, 1, index)[0] ?? { id: index };
}
