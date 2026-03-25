/**
 * Shape extraction and array unwrapping from schema objects.
 */

import { prop } from "./prop";

/** Extract object shape (field name → raw field schema) from a schema */
export function extractShape(schema: unknown): Record<string, unknown> | undefined {
  if (!schema || typeof schema !== "object") return undefined;

  // Zod v4: schema.shape or _def.shape
  const shape = prop(schema, "shape") ?? prop(schema, "_def", "shape");
  if (shape && typeof shape === "object") return shape as Record<string, unknown>;

  // Valibot: schema.entries
  const entries = prop(schema, "entries");
  if (entries && typeof entries === "object") return entries as Record<string, unknown>;

  return undefined;
}

/**
 * If schema is a pagination/wrapper object, extract the collection item schema.
 *
 * Detection rule: if the object has exactly ONE field that is `array<object>`,
 * that field holds the collection items. All other fields are metadata
 * (total, page, cursor, hasMore, etc.).
 *
 * Returns undefined if zero or 2+ array-of-object fields found (ambiguous).
 */
export function extractPaginatedItemSchema(schema: unknown): unknown {
  const shape = extractShape(schema);
  if (!shape) return undefined;

  let match: unknown;
  let count = 0;

  for (const field of Object.values(shape)) {
    const element = unwrapArraySchema(field);
    if (!element) continue;
    // Only count arrays whose element is an object (has shape)
    if (!extractShape(element)) continue;
    match = element;
    count++;
    if (count > 1) return undefined; // ambiguous — bail out
  }

  return count === 1 ? match : undefined;
}

/** If schema is an array type, extract the inner element schema */
export function unwrapArraySchema(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return undefined;

  // Zod v4: _def.element
  const v4Element = prop(schema, "_def", "element");
  if (v4Element) return v4Element;

  // Zod v3: _def.type (when typeName === "ZodArray")
  const v3Def = prop(schema, "_def") as Record<string, unknown> | undefined;
  if (v3Def?.typeName === "ZodArray") return v3Def.type;

  // Valibot: { type: "array", item }
  if (prop(schema, "type") === "array") return prop(schema, "item");

  return undefined;
}
