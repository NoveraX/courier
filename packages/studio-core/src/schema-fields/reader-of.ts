import { standardJsonSchema } from "@noverax/courier/internal";

import { member } from "../member";
import { readJsonSchema } from "./json-schema-node";
import { ownFieldsOf } from "./own-fields";
import type { NodeReader } from "./schema-node";
import { readValibot } from "./valibot-node";
import { readZodV3, readZodV4 } from "./zod-node";

/** A schema of any Standard Schema library, as the core describes one. */
type StandardSchema = NonNullable<Parameters<typeof standardJsonSchema>[0]>;

/* What ArkType is told, where it writes JSON Schema of its own alone, so that a part JSON cannot
   hold — a Date, a `.narrow()` — is written as what can be said of it rather than thrown for. */
const ARKTYPE_OPTIONS = { fallback: (context: { base: unknown }) => context.base };

/**
 * The reader a schema's vendor needs, and the value it reads from: the
 * schema itself, or the JSON Schema it gives of itself — through the core,
 * as an OpenAPI document describes it, so an object a generated
 * `_ownFields` checks is read by its fields wherever it sits, and an
 * array with elements after its rest as an array.
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
  const described = isStandardSchema(schema) ? standardJsonSchema(schema, "input") : undefined;
  if (described !== undefined) return { read: readJsonSchema, root: described };
  /* ArkType's `_ownFields` is a check of its own, which JSON Schema writes as an object with no field. */
  const own = ownFieldsOf(schema)?.fields ?? schema;
  const toJsonSchema = member(own, "toJsonSchema");
  if (typeof toJsonSchema !== "function") return undefined;
  const arktype = member(member(own, "~standard"), "vendor") === "arktype";
  const root: unknown = Reflect.apply(toJsonSchema, own, arktype ? [ARKTYPE_OPTIONS] : []);
  return { read: readJsonSchema, root };
}

function isStandardSchema(value: unknown): value is StandardSchema {
  const standard = member(value, "~standard");
  return typeof standard === "object" && standard !== null;
}
