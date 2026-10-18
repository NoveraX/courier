import { member } from "../member";
import { readJsonSchema } from "./json-schema-node";
import type { NodeReader } from "./schema-node";
import { readValibot } from "./valibot-node";
import { readZodV3, readZodV4 } from "./zod-node";

/**
 * The reader a schema's vendor needs, and the value it reads from: the
 * schema itself, or the JSON Schema it gives of itself.
 *
 * @param schema - An endpoint's variables schema
 * @returns The reader and its root, or `undefined` for a schema no reader reads
 * @example
 * ```ts
 * const reader = readerOf(z.object({ id: z.string() }));
 * reader?.read(reader.root); // { kind: "object", fields: [...], … }
 * ```
 */
export function readerOf(schema: unknown): { read: NodeReader; root: unknown } | undefined {
  if (member(schema, "_zod") !== undefined) return { read: readZodV4, root: schema };
  if (member(schema, "_def") !== undefined) return { read: readZodV3, root: schema };
  if (member(schema, "kind") === "schema") return { read: readValibot, root: schema };
  const toJsonSchema = member(schema, "toJsonSchema");
  if (typeof toJsonSchema !== "function") return undefined;
  return { read: readJsonSchema, root: Reflect.apply(toJsonSchema, schema, []) };
}
