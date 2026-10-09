/** JSON Schema, as an OpenAPI 3.1 document holds it. */
export type Schema = Record<string, unknown>;

/** How the values one schema takes stand against another's. */
export type Relation = "same" | "narrowed" | "widened" | "changed";

/** What a schema takes at one place, read for comparing: its types, its values, its bounds. */
interface Accepted {
  types: Set<string>;
  /** The only values it takes, when it lists them */
  values: Set<string> | undefined;
  bounds: { min?: number; max?: number; minLength?: number; maxLength?: number; pattern?: string };
}

/**
 * How the values a schema takes changed: `narrowed` when the new one takes
 * fewer — a type dropped, an enum's value gone, `null` no longer taken, a
 * bound tightened — `widened` when it takes more, `changed` when each takes
 * something the other does not. An integer is a narrower number. An object
 * or a list is compared by its type here; its fields and items, place by
 * place, by the walk that calls this.
 *
 * @param before - The schema in the base definition
 * @param after - The schema in the new one
 * @returns How it changed
 * @example
 * ```ts
 * relationOf({ type: "string" }, { type: "string", enum: ["a"] }); // → "narrowed"
 * ```
 */
export function relationOf(before: Schema, after: Schema): Relation {
  const a = acceptedOf(before);
  const b = acceptedOf(after);
  const lost =
    [...a.types].some((type) => !takesType(b.types, type)) ||
    valuesLost(a, b) ||
    boundsTightened(a, b);
  const gained =
    [...b.types].some((type) => !takesType(a.types, type)) ||
    valuesLost(b, a) ||
    boundsTightened(b, a);
  if (lost && gained) return "changed";
  if (lost) return "narrowed";
  return gained ? "widened" : "same";
}

/**
 * The JSON types a schema takes, its unions and nullable types read through.
 *
 * @param schema - The schema
 * @returns Its types; `any` when it takes anything
 * @example
 * ```ts
 * typesOf({ type: ["string", "null"] }); // Set { "string", "null" }
 * ```
 */
export function typesOf(schema: Schema): Set<string> {
  const types = new Set<string>();
  const named = Array.isArray(schema.type)
    ? schema.type
    : schema.type === undefined
      ? []
      : [schema.type];
  for (const type of named) if (typeof type === "string") types.add(type);
  for (const branch of [...list(schema.anyOf), ...list(schema.oneOf)]) {
    if (isSchema(branch)) for (const type of typesOf(branch)) types.add(type);
  }
  for (const value of [...list(schema.enum), ...("const" in schema ? [schema.const] : [])]) {
    types.add(value === null ? "null" : Number.isInteger(value) ? "integer" : typeof value);
  }
  if (types.size === 0)
    types.add(isSchema(schema.properties) ? "object" : schema.items ? "array" : "any");
  return types;
}

function acceptedOf(schema: Schema): Accepted {
  const listed = [...list(schema.enum), ...("const" in schema ? [schema.const] : [])];
  const bounds: Accepted["bounds"] = {};
  if (typeof schema.minimum === "number") bounds.min = schema.minimum;
  if (typeof schema.maximum === "number") bounds.max = schema.maximum;
  if (typeof schema.minLength === "number") bounds.minLength = schema.minLength;
  if (typeof schema.maxLength === "number") bounds.maxLength = schema.maxLength;
  if (typeof schema.pattern === "string") bounds.pattern = schema.pattern;
  return {
    types: typesOf(schema),
    values: listed.length > 0 ? new Set(listed.map((value) => JSON.stringify(value))) : undefined,
    bounds,
  };
}

/* Whether a set of types takes a type: anything takes all, a number takes an integer. */
function takesType(types: ReadonlySet<string>, type: string): boolean {
  return types.has("any") || types.has(type) || (type === "integer" && types.has("number"));
}

/* Values `from` took that `to` no longer does: an enum's value gone, or a list of values where any was taken. */
function valuesLost(from: Accepted, to: Accepted): boolean {
  if (!to.values) return false;
  if (!from.values) return true;
  return [...from.values].some((value) => !to.values?.has(value));
}

function boundsTightened(from: Accepted, to: Accepted): boolean {
  const { min, max, minLength, maxLength, pattern } = to.bounds;
  return (
    (min !== undefined && (from.bounds.min === undefined || min > from.bounds.min)) ||
    (max !== undefined && (from.bounds.max === undefined || max < from.bounds.max)) ||
    (minLength !== undefined &&
      (from.bounds.minLength === undefined || minLength > from.bounds.minLength)) ||
    (maxLength !== undefined &&
      (from.bounds.maxLength === undefined || maxLength < from.bounds.maxLength)) ||
    (pattern !== undefined && pattern !== from.bounds.pattern)
  );
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isSchema(value: unknown): value is Schema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
