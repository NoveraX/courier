/** What a response schema declares at one place in an answer. */
export interface DeclaredPlace {
  /** The JSON types it takes there; `any` for a place that takes anything */
  types: Set<string>;
  /** Its object requires it */
  required: boolean;
  /** An object there takes keys it does not name */
  open: boolean;
}

/** What a response schema declares, place by place. */
export interface DeclaredShape {
  places: Map<string, DeclaredPlace>;
  /** Objects whose keys are data, not names — a record — whose values sit under `<path>.*` */
  maps: Set<string>;
}

type JsonSchema = Record<string, unknown>;

/* A schema that refers to itself is read this deep, which no answer outgrows. */
const DEEPEST = 16;

/**
 * What a response schema, as JSON Schema, declares at each place of an
 * answer — `""` for the answer itself, `user.id`, `items[].price`,
 * `prices.*` for a record's values: the JSON types it takes, whether its
 * object requires it, and whether an object there takes keys it does not
 * name. `$defs` references, unions, intersections, nullable types and
 * enums are read; a place with no constraint takes anything.
 *
 * @param schema - The response schema as JSON Schema, as its library writes it
 * @returns The places it declares
 * @example
 * ```ts
 * declaredShapeOf({ type: "object", properties: { id: { type: "string" } }, required: ["id"] }).places.get("id");
 * // { types: Set { "string" }, required: true, open: false }
 * ```
 */
export function declaredShapeOf(schema: unknown): DeclaredShape {
  const shape: DeclaredShape = { places: new Map(), maps: new Set() };
  const defs = isSchema(schema) && isSchema(schema.$defs) ? schema.$defs : {};
  walk(shape, schema, "", true, defs, 0);
  return shape;
}

function walk(
  shape: DeclaredShape,
  node: unknown,
  path: string,
  required: boolean,
  defs: JsonSchema,
  depth: number,
): void {
  if (depth > DEEPEST) return;
  const schema = resolved(node, defs);
  const place = placeAt(shape, path, required);
  if (!schema || Object.keys(schema).every((key) => NOTES.has(key))) {
    place.types.add("any");
    return;
  }
  for (const branch of [...list(schema.anyOf), ...list(schema.oneOf), ...list(schema.allOf)]) {
    walk(shape, branch, path, required, defs, depth + 1);
  }
  for (const type of typesOf(schema)) place.types.add(type);
  if (place.types.has("object")) walkObject(shape, schema, path, defs, depth);
  if (place.types.has("array")) {
    for (const item of [schema.items, ...list(schema.prefixItems)]) {
      if (item !== undefined && item !== false)
        walk(shape, item, `${path}[]`, false, defs, depth + 1);
    }
  }
}

function walkObject(
  shape: DeclaredShape,
  schema: JsonSchema,
  path: string,
  defs: JsonSchema,
  depth: number,
): void {
  const place = shape.places.get(path) ?? placeAt(shape, path, false);
  const required = new Set(list(schema.required).filter((key) => typeof key === "string"));
  const properties = isSchema(schema.properties) ? schema.properties : {};
  for (const [key, child] of Object.entries(properties)) {
    walk(shape, child, path === "" ? key : `${path}.${key}`, required.has(key), defs, depth + 1);
  }
  const rest = schema.additionalProperties;
  if (rest === true || (isSchema(rest) && Object.keys(rest).length === 0)) place.open = true;
  else if (isSchema(rest)) {
    shape.maps.add(path);
    walk(shape, rest, path === "" ? "*" : `${path}.*`, false, defs, depth + 1);
  }
}

/* Keywords that say what a schema is for, not what it takes. */
const NOTES = new Set([
  "description",
  "title",
  "default",
  "examples",
  "deprecated",
  "readOnly",
  "writeOnly",
  "$schema",
  "$defs",
  "$id",
  "$comment",
]);

function typesOf(schema: JsonSchema): string[] {
  const named = Array.isArray(schema.type)
    ? schema.type
    : schema.type === undefined
      ? []
      : [schema.type];
  const types = named
    .filter((type): type is string => typeof type === "string")
    .map((type) => (type === "integer" ? "number" : type));
  const values = [...list(schema.enum), ...("const" in schema ? [schema.const] : [])];
  for (const value of values)
    types.push(value === null ? "null" : Array.isArray(value) ? "array" : typeof value);
  if (
    types.length === 0 &&
    (isSchema(schema.properties) || schema.additionalProperties !== undefined)
  )
    types.push("object");
  if (types.length === 0 && schema.items !== undefined) types.push("array");
  return types;
}

function resolved(node: unknown, defs: JsonSchema): JsonSchema | undefined {
  if (node === true) return {};
  if (!isSchema(node)) return undefined;
  const ref = node.$ref;
  if (typeof ref !== "string" || !ref.startsWith("#/$defs/")) return node;
  const target = defs[ref.slice("#/$defs/".length)];
  return isSchema(target)
    ? { ...target, ...Object.fromEntries(Object.entries(node).filter(([key]) => key !== "$ref")) }
    : undefined;
}

function placeAt(shape: DeclaredShape, path: string, required: boolean): DeclaredPlace {
  const found = shape.places.get(path);
  if (found) {
    found.required &&= required;
    return found;
  }
  const place = { types: new Set<string>(), required, open: false };
  shape.places.set(path, place);
  return place;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isSchema(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
