import { member } from "../member";
import { readJsonSchema } from "./json-schema-node";
import type { NodeReader } from "./schema-node";
import { readValibot } from "./valibot-node";
import { readZodV3, readZodV4 } from "./zod-node";

/* What ArkType is told so that a part JSON cannot hold — a Date, a `.narrow()` — is written as
   what can be said of it: by default it throws for the whole schema, which then listed no field. */
const ARKTYPE_OPTIONS = { fallback: (context: { base: unknown }) => context.base };

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
  const arktype = member(member(schema, "~standard"), "vendor") === "arktype";
  const root: unknown = Reflect.apply(toJsonSchema, schema, arktype ? [ARKTYPE_OPTIONS] : []);
  return { read: readJsonSchema, root };
}
