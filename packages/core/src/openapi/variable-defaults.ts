import type { JSONSchema } from "./types";

/* What JSON Schema says of a value's type, for a variable no schema describes. */
function schemaOfValue(value: unknown): JSONSchema {
  if (typeof value === "string") return { type: "string" };
  if (typeof value === "boolean") return { type: "boolean" };
  if (typeof value === "number") return { type: Number.isInteger(value) ? "integer" : "number" };
  if (Array.isArray(value)) return { type: "array" };
  if (typeof value === "object" && value !== null) return { type: "object" };
  return {};
}

/**
 * The variables' schema with what `.defaults()` fills in: each defaulted
 * property carries its `default` and is no longer required, and one the
 * schema does not describe — variables declared by type alone — is added
 * with the type its value has.
 *
 * @param schema - The variables as JSON Schema, when they have a schema
 * @param defaults - The endpoint's defaults, if it has any
 * @returns The schema the document writes
 * @example
 * ```ts
 * withDefaultsShown(undefined, { groupBy: "year" });
 * // → { type: "object", properties: { groupBy: { type: "string", default: "year" } } }
 * ```
 */
export function withDefaultsShown(
  schema: JSONSchema,
  defaults: Readonly<Record<string, unknown>> | undefined,
): JSONSchema;
export function withDefaultsShown(
  schema: JSONSchema | undefined,
  defaults: Readonly<Record<string, unknown>> | undefined,
): JSONSchema | undefined;
export function withDefaultsShown(
  schema: JSONSchema | undefined,
  defaults: Readonly<Record<string, unknown>> | undefined,
): JSONSchema | undefined {
  if (defaults === undefined) return schema;
  const base: JSONSchema = schema ?? { type: "object", properties: {} };
  if (base.type !== "object") return schema;
  const described =
    typeof base.properties === "object" && base.properties !== null
      ? (base.properties as Record<string, JSONSchema>)
      : {};
  const properties = { ...described };
  for (const [name, value] of Object.entries(defaults)) {
    properties[name] = { ...(described[name] ?? schemaOfValue(value)), default: value };
  }
  const required = Array.isArray(base.required)
    ? base.required.filter((name) => typeof name !== "string" || !Object.hasOwn(defaults, name))
    : undefined;
  return { ...base, properties, ...(required !== undefined && { required }) };
}
