/**
 * Generators for compound schema types:
 * nested objects, typed arrays, tuples, records, unions, discriminated unions.
 */

import type { FieldMeta } from "../schema-introspect";
import { analyzeField } from "../schema-introspect";

import type { EntityContext } from "./context";

/** Generator function signature — passed by value.ts to avoid circular imports */
export type ValueGenerator = (
  key: string,
  meta: FieldMeta,
  index: number,
  context: EntityContext,
) => unknown;

const NESTED_ARRAY_SIZE = 3;
const RECORD_SAMPLE_KEYS = ["alpha", "beta", "gamma"];

/** Generate a nested object from a raw shape (field name → raw schema) */
export function generateObject(
  meta: FieldMeta,
  index: number,
  context: EntityContext,
  gen: ValueGenerator,
): Record<string, unknown> {
  if (!meta.shape) return {};

  const record: Record<string, unknown> = {};
  for (const [key, rawField] of Object.entries(meta.shape)) {
    record[key] = gen(key, analyzeField(rawField), index, context);
  }
  return record;
}

/** Generate a typed array with inner element generation */
export function generateArray(
  key: string,
  meta: FieldMeta,
  index: number,
  context: EntityContext,
  gen: ValueGenerator,
): unknown[] {
  const inner = meta.innerField;
  if (!inner) return [];

  const atLeast = Math.max(NESTED_ARRAY_SIZE, meta.minLength ?? 0);
  const length = Math.min(atLeast, meta.maxLength ?? atLeast);
  return Array.from({ length }, (_, i) => gen(key, inner, index + i, context));
}

/** Generate a tuple from ordered item schemas */
export function generateTuple(
  key: string,
  meta: FieldMeta,
  index: number,
  context: EntityContext,
  gen: ValueGenerator,
): unknown[] {
  if (!meta.items?.length) return [];
  return meta.items.map((item, i) => gen(`${key}_${i}`, item, index + i, context));
}

/** Generate a record (map) with sample keys and typed values */
export function generateRecordValue(
  meta: FieldMeta,
  index: number,
  context: EntityContext,
  gen: ValueGenerator,
): Record<string, unknown> {
  const vf = meta.valueField;
  if (!vf) return {};

  return Object.fromEntries(RECORD_SAMPLE_KEYS.map((k, i) => [k, gen(k, vf, index + i, context)]));
}

/** Generate a value from a union by selecting a variant via index rotation */
export function generateUnionValue(
  key: string,
  meta: FieldMeta,
  index: number,
  context: EntityContext,
  gen: ValueGenerator,
): unknown {
  const variants = meta.variants;
  if (!variants?.length) return null;

  const variant = variants[index % variants.length];
  if (!variant) return null;

  // Discriminated union with object variants → generate full object
  if (variant.type === "object" && variant.shape) {
    return generateObject(variant, index, context, gen);
  }

  // Union of literals (e.g. z.union([z.literal("a"), z.literal("b")]))
  if (variant.type === "literal" && variant.literalValue !== undefined) {
    return variant.literalValue;
  }

  return gen(key, variant, index, context);
}
