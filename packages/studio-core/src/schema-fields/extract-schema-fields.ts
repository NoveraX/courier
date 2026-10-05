import { createLogger } from "@noverax/courier";

import { member } from "../member";
import { fieldLabel } from "./field-label";
import { readJsonSchema } from "./json-schema-node";
import type { NodeField, NodeReader } from "./schema-node";
import { readValibot } from "./valibot-node";
import { readZodV3, readZodV4 } from "./zod-node";

const log = createLogger("Studio");

/* How deep the list follows nested objects, and how many fields it lists at most. */
const MAX_DEPTH = 3;
const MAX_FIELDS = 60;

/** A field an endpoint's variables schema declares. */
export interface SchemaField {
  /** Where it sits: `currency`, `shipping.method`, `items[].sku`. */
  path: string;
  /** What it holds: `string`, `object[]`, `"a" | "b"`, `number | null`. */
  type: string;
  required: boolean;
}

/* The reader a schema's vendor needs, and the value it reads from. */
function readerOf(schema: unknown): { read: NodeReader; root: unknown } | undefined {
  if (member(schema, "_zod") !== undefined) return { read: readZodV4, root: schema };
  if (member(schema, "_def") !== undefined) return { read: readZodV3, root: schema };
  if (member(schema, "kind") === "schema") return { read: readValibot, root: schema };
  const toJsonSchema = member(schema, "toJsonSchema");
  if (typeof toJsonSchema !== "function") return undefined;
  return { read: readJsonSchema, root: Reflect.apply(toJsonSchema, schema, []) };
}

function collect(
  fields: readonly NodeField[],
  read: NodeReader,
  at: { prefix: string; depth: number },
  out: SchemaField[],
): void {
  for (const field of fields) {
    if (out.length >= MAX_FIELDS) return;
    const node = read(field.schema);
    if (!node) continue;
    const path = `${at.prefix}${field.name}`;
    out.push({ path, type: fieldLabel(node, read), required: !(field.optional ?? node.optional) });
    if (at.depth >= MAX_DEPTH) continue;
    const element =
      node.kind === "array" && node.element !== undefined ? read(node.element) : undefined;
    const nested =
      node.kind === "object"
        ? { node, prefix: `${path}.` }
        : element?.kind === "object"
          ? { node: element, prefix: `${path}[].` }
          : undefined;
    if (nested?.node.fields)
      collect(nested.node.fields, read, { prefix: nested.prefix, depth: at.depth + 1 }, out);
  }
}

/**
 * The fields an endpoint's variables schema declares — Zod (v4 or v3),
 * Valibot, or any schema with a `toJsonSchema()` such as ArkType's — each
 * with where it sits, its type and whether it is required, following
 * nested objects and arrays of objects a few levels down.
 *
 * @param schema - The endpoint's variables schema
 * @returns The fields — none for an object schema without any — or
 *   `undefined` when the schema is not an object schema it can read
 * @example
 * ```ts
 * extractSchemaFields(z.object({ id: z.string(), limit: z.number().optional() }));
 * // → [{ path: "id", type: "string", required: true }, { path: "limit", type: "number", required: false }]
 * ```
 */
export function extractSchemaFields(schema: unknown): SchemaField[] | undefined {
  try {
    const reader = readerOf(schema);
    const root = reader?.read(reader.root);
    if (!reader || root?.kind !== "object" || !root.fields) return undefined;
    const fields: SchemaField[] = [];
    collect(root.fields, reader.read, { prefix: "", depth: 1 }, fields);
    return fields;
  } catch (error) {
    /* A getter of the schema threw — a lazy schema that cannot be read yet. */
    log.debug("Could not read the fields of a variables schema", error);
    return undefined;
  }
}
