/**
 * Schema-based fake data generator.
 *
 * Produces realistic, deterministic mock data by combining:
 * 1. Schema introspection (types, enums, constraints)
 * 2. Field-name heuristics (e.g. "email" → valid email format)
 * 3. Curated dictionaries for natural-looking values
 *
 * Zero external dependencies — no faker.js.
 */

import { PERSON_NAMES } from "./dictionaries";
import { pseudoRandom } from "./gen-helpers";
import { generateNumber } from "./gen-number";
import { generateDateString, generateString } from "./gen-string";
import type { FieldMeta } from "./schema-introspect";
import { analyzeField, extractShape, unwrapArraySchema } from "./schema-introspect";

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

  // Detect entity context from sibling fields for smarter name generation
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

// ── Value dispatch ────────────────────────────────────────────────────────────

/** Entity context inferred from sibling field names */
export type EntityContext = "product" | "person" | "generic";

function detectEntityContext(fieldKeys: string[]): EntityContext {
  const lower = new Set(fieldKeys.map((k) => k.toLowerCase()));
  if (lower.has("price") || lower.has("sku") || lower.has("instock") || lower.has("category"))
    return "product";
  if (lower.has("email") || lower.has("firstname") || lower.has("lastname") || lower.has("age"))
    return "person";
  return "generic";
}

function generateValue(
  key: string,
  meta: FieldMeta,
  index: number,
  context: EntityContext = "generic",
): unknown {
  // Unwrap optional/nullable → generate inner value
  if ((meta.type === "optional" || meta.type === "nullable") && meta.innerField) {
    return generateValue(key, meta.innerField, index);
  }

  // Enum — cycle through schema-declared values
  if (meta.type === "enum" && meta.enumValues?.length) {
    return meta.enumValues[index % meta.enumValues.length];
  }

  switch (meta.type) {
    case "string":
      return generateString(key, index, context);
    case "number":
      return generateNumber(key, index, meta);
    case "bigint":
      return generateNumber(key, index, meta);
    case "boolean":
      return generateBoolean(key, index);
    case "date":
      return generateDateString(index);
    case "array":
      return [];
    case "object":
      return {};
    default:
      return generateString(key, index, context);
  }
}

// ── Boolean heuristics ────────────────────────────────────────────────────────

function generateBoolean(key: string, index: number): boolean {
  const lower = key.toLowerCase();
  // "active", "enabled", "visible", "published" → mostly true
  if (
    lower.includes("active") ||
    lower.includes("enabled") ||
    lower.includes("visible") ||
    lower.includes("published")
  ) {
    return pseudoRandom(index) > 0.2;
  }
  // "deleted", "archived", "disabled", "blocked" → mostly false
  if (
    lower.includes("deleted") ||
    lower.includes("archived") ||
    lower.includes("disabled") ||
    lower.includes("blocked")
  ) {
    return pseudoRandom(index) > 0.8;
  }
  // "inStock", "available" → 80% true
  if (lower.includes("stock") || lower.includes("available")) {
    return pseudoRandom(index) > 0.2;
  }
  return pseudoRandom(index) > 0.3;
}

// ── Fallback ──────────────────────────────────────────────────────────────────

function generateFallbackRecords(count: number, startId: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => ({
    id: startId + i,
    name: PERSON_NAMES[(startId + i) % PERSON_NAMES.length] ?? `Item ${startId + i}`,
  }));
}
