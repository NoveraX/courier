import type { StandardJSONSchemaV1, StandardSchemaV1 } from "@standard-schema/spec";

import type { JSONSchema, JSONSchemaFallback, SchemaSide } from "./types";

/* What zod, and any library but ArkType, is told: write a part JSON cannot hold — a Date, a
   function — as nothing, rather than refuse the whole schema. */
const UNREPRESENTABLE_AS_ANY = { unrepresentable: "any" };

/**
 * A schema as JSON Schema 2020-12: as its own library writes it, else as
 * the fallback converter does, else `undefined`. A converter that throws
 * describes nothing, as one with nothing to say does, so a document goes
 * on without that one schema. A schema Studio's generator writes for an
 * object with a field named like `constructor` keeps the object it checks
 * as `fields`; when its library describes none of it, its fields are
 * described in its place, as Valibot's converter can describe them.
 *
 * @param schema - The schema
 * @param side - `input` for what a call sends, `output` for what it answers with
 * @param fallback - A converter for a library without Standard JSON Schema
 * @returns The JSON Schema, its `$schema` as its writer left it, or `undefined`
 * @example
 * ```ts
 * describedSchema(z.object({ id: z.string() }), "input"); // { $schema: "…", type: "object", … }
 * ```
 */
export function describedSchema(
  schema: StandardSchemaV1,
  side: SchemaSide,
  fallback?: JSONSchemaFallback,
): JSONSchema | undefined {
  const converted = convertedBy(schema, side);
  if (converted !== undefined) return converted;
  const fields = fieldsOf(schema);
  if (fields !== undefined) return convertedBy(fields, side) ?? attempted(fallback, fields, side);
  return attempted(fallback, schema, side);
}

function convertedBy(schema: StandardSchemaV1, side: SchemaSide): JSONSchema | undefined {
  const standard: Partial<StandardJSONSchemaV1.Props> = schema["~standard"];
  const converter = standard.jsonSchema;
  if (typeof converter?.[side] !== "function") return undefined;
  const libraryOptions =
    standard.vendor === "arktype" ? { fallback: arktypeFallback(side) } : UNREPRESENTABLE_AS_ANY;
  try {
    return converter[side]({ target: "draft-2020-12", libraryOptions });
  } catch {
    return undefined;
  }
}

function attempted(
  fallback: JSONSchemaFallback | undefined,
  schema: StandardSchemaV1,
  side: SchemaSide,
): JSONSchema | undefined {
  try {
    return fallback?.(schema, side);
  } catch {
    return undefined;
  }
}

/* The object a generated `_ownFields` checks, kept on it as `fields`. */
function fieldsOf(schema: StandardSchemaV1): StandardSchemaV1 | undefined {
  const fields: unknown = Reflect.get(schema, "fields");
  return isStandardSchema(fields) ? fields : undefined;
}

function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return false;
  const standard: unknown = Reflect.get(value, "~standard");
  return typeof standard === "object" && standard !== null;
}

/**
 * What ArkType writes for a part JSON cannot hold, which by default it
 * refuses the whole schema for: a check that carries the Standard JSON
 * Schema of what it checks — the object a generated `_ownFields` checks,
 * wherever it sits — as that schema; an array with elements after its
 * rest as an array, unspecified, since the rest's items do not hold for
 * them; and any other part as what can be said of it without the check.
 */
function arktypeFallback(side: SchemaSide) {
  return (context: { code?: unknown; base?: unknown; predicate?: unknown }): unknown => {
    if (context.code === "arrayPostfix") return { type: "array" };
    if (context.code !== "predicate" || !isStandardSchema(context.predicate)) return context.base;
    const carried = convertedBy(context.predicate, side);
    if (carried === undefined) return context.base;
    const { $schema: _dialect, ...described } = carried;
    return described;
  };
}
