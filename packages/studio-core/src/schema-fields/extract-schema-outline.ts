import { createLogger } from "@noverax/courier";

import { readerOf } from "./reader-of";
import type { NodeField, NodeReader, SchemaNode } from "./schema-node";
import type { OutlineField, OutlineValue, SchemaOutline } from "./schema-outline";

const log = createLogger("Studio");

/* How deep the outline follows a schema, how many of its parts it reads at most, and the most
   values it lists for an enum: past them, it holds the types of the values. */
const MAX_DEPTH = 8;
const MAX_PARTS = 200;
const MAX_VALUES = 32;

/* What a part of a schema takes, when the outline can tell, and whether a field of it may be left
   out: its schema takes `undefined`, or gives a value of its own. */
interface Part {
  outline: SchemaOutline | undefined;
  optional: boolean;
}

/* A part whose values the outline cannot tell, and which may be left out. */
const ANY: Part = { outline: undefined, optional: true };

const NULL: SchemaOutline = { type: "null" };

/* What reading carries down: its vendor's reader, the schemas it is inside of — one that holds
   itself is not read again — and how many more parts it may read. */
interface Walk {
  read: NodeReader;
  inside: Set<unknown>;
  left: number;
}

function isOutlineValue(value: unknown): value is OutlineValue {
  if (typeof value === "number") return Number.isFinite(value);
  return value === null || typeof value === "string" || typeof value === "boolean";
}

function typeOutline(value: OutlineValue): SchemaOutline {
  if (value === null) return NULL;
  if (typeof value === "string") return { type: "string" };
  return typeof value === "number" ? { type: "number" } : { type: "boolean" };
}

/* The forms of a union, those of a union among them taken in and its enums' values in one, each
   once — however its vendor writes it; a single form stands alone. */
function unionOf(forms: readonly SchemaOutline[]): SchemaOutline {
  const flat = forms.flatMap((one) => (one.type === "union" ? one.options : [one]));
  const values = [...new Set(flat.flatMap((one) => (one.type === "enum" ? one.values : [])))];
  const merged: SchemaOutline = { type: "enum", values };
  const options: SchemaOutline[] = [];
  const seen = new Set<string>();
  for (const form of flat.map((one) => (one.type === "enum" ? merged : one))) {
    const key = JSON.stringify(form);
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(form);
  }
  const [only] = options;
  return only && options.length === 1 ? only : { type: "union", options };
}

function takesNull(outline: SchemaOutline): boolean {
  if (outline.type === "null") return true;
  if (outline.type === "enum") return outline.values.includes(null);
  return outline.type === "union" && outline.options.some(takesNull);
}

function orNull(outline: SchemaOutline | undefined): SchemaOutline | undefined {
  return outline === undefined || takesNull(outline) ? outline : unionOf([outline, NULL]);
}

/* An enum's or a literal's values: `undefined` among them lets its field be left out, and a value
   JSON cannot hold — a bigint, a symbol — leaves the outline unable to tell. */
function valuesPart(values: readonly unknown[]): Part {
  const optional = values.includes(undefined);
  const held = [...new Set(values.filter((value) => value !== undefined))];
  if (held.length === 0 || !held.every(isOutlineValue)) return { outline: undefined, optional };
  const outline: SchemaOutline =
    held.length > MAX_VALUES ? unionOf(held.map(typeOutline)) : { type: "enum", values: held };
  return { outline, optional };
}

/* The fields that say something: each one the object is refused without, or whose value the
   outline can tell. */
function outlineFields(fields: readonly NodeField[], walk: Walk, depth: number): OutlineField[] {
  const outlined: OutlineField[] = [];
  for (const field of fields) {
    const { outline, optional } = partOf(field.schema, walk, depth + 1);
    const required = !(field.optional ?? optional);
    if (outline) outlined.push({ name: field.name, required, outline });
    else if (required) outlined.push({ name: field.name, required });
  }
  return outlined;
}

function arrayOutline(element: unknown, walk: Walk, depth: number): SchemaOutline {
  const items = element === undefined ? undefined : partOf(element, walk, depth + 1).outline;
  return items ? { type: "array", items } : { type: "array" };
}

/* A union takes what any of its options takes: the outline tells it only when it tells each. */
function unionPart(options: readonly unknown[], walk: Walk, depth: number): Part {
  const parts = options.map((option) => partOf(option, walk, depth + 1));
  const outlines = parts.flatMap((part) => (part.outline ? [part.outline] : []));
  const told = outlines.length > 0 && outlines.length === parts.length;
  const optional = parts.some((part) => part.optional);
  return { outline: told ? unionOf(outlines) : undefined, optional };
}

function kindPart(node: SchemaNode, walk: Walk, depth: number): Part {
  switch (node.kind) {
    case "string":
    case "number":
    case "boolean":
    case "null":
      return { outline: { type: node.kind }, optional: false };
    case "enum":
    case "literal":
      return valuesPart(node.values ?? []);
    case "object": {
      const fields = outlineFields(node.fields ?? [], walk, depth);
      return { outline: { type: "object", fields }, optional: false };
    }
    case "record":
      return { outline: { type: "object" }, optional: false };
    case "array":
      return { outline: arrayOutline(node.element, walk, depth), optional: false };
    case "union":
      return unionPart(node.options ?? [], walk, depth);
    case "unknown":
      return ANY;
    default:
      /* A bigint or a date, which no JSON value is: its field may not be left out, and what it
         takes is the schema's to say. */
      return { outline: undefined, optional: false };
  }
}

function partOf(schema: unknown, walk: Walk, depth: number): Part {
  if (depth > MAX_DEPTH || walk.left <= 0 || walk.inside.has(schema)) return ANY;
  const node = walk.read(schema);
  if (!node || node.lenient) return ANY;
  walk.left -= 1;
  walk.inside.add(schema);
  const part = kindPart(node, walk, depth);
  walk.inside.delete(schema);
  return {
    outline: node.nullable ? orNull(part.outline) : part.outline,
    optional: part.optional || node.optional,
  };
}

/**
 * What an endpoint's variables schema takes — Zod (v4 or v3), Valibot, or
 * any schema with a `toJsonSchema()` such as ArkType's — for the
 * Playground to check variables against before it sends them: the type
 * of each value, the values an enum allows, the fields an object is
 * refused without, followed through nested objects, arrays and unions.
 * What a part takes is told only when no value the schema takes is
 * refused by it: a part that converts its value first or falls back on
 * one of its own takes any value, and a field that may be `undefined` may
 * be left out.
 *
 * @param schema - The endpoint's variables schema
 * @returns The outline, or `undefined` when the schema is not one it can read
 * @example
 * ```ts
 * extractSchemaOutline(z.object({ orderId: z.string(), note: z.string().optional() }));
 * // → { type: "object", fields: [
 * //     { name: "orderId", required: true, outline: { type: "string" } },
 * //     { name: "note", required: false, outline: { type: "string" } },
 * //   ] }
 * ```
 */
export function extractSchemaOutline(schema: unknown): SchemaOutline | undefined {
  try {
    const reader = readerOf(schema);
    if (!reader) return undefined;
    return partOf(reader.root, { read: reader.read, inside: new Set(), left: MAX_PARTS }, 0)
      .outline;
  } catch (error) {
    /* A getter of the schema threw — a lazy schema that cannot be read yet. */
    log.debug("Could not outline a variables schema", error);
    return undefined;
  }
}
