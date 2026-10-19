import { createLogger } from "@noverax/courier";

import { FORMAT_SAMPLES } from "./format-samples";
import { readerOf } from "./reader-of";
import type { NodeField, NodeReader, SchemaNode } from "./schema-node";

const log = createLogger("Studio");

/* How deep the sample follows nested objects, as the field list does, and the most items it makes an array hold. */
const MAX_DEPTH = 3;
const MAX_ITEMS = 100;

/* A value for a schema, and whether the schema is known to take it. */
interface Sample {
  value: unknown;
  sure: boolean;
}

const UNSURE: Sample = { value: "", sure: false };

function within(value: number, node: SchemaNode): boolean {
  return (
    value >= (node.least ?? Number.NEGATIVE_INFINITY) &&
    value <= (node.most ?? Number.POSITIVE_INFINITY)
  );
}

function stringSample(node: SchemaNode): Sample {
  const formatted = node.format === undefined ? undefined : FORMAT_SAMPLES.get(node.format);
  const value = formatted ?? "x".repeat(node.least ?? 0);
  return { value, sure: within(value.length, node) && !node.checked };
}

/* Zero, or the bound nearest it, moved up to the next multiple the number must be. */
function numberSample(node: SchemaNode): Sample {
  const near = Math.min(
    Math.max(0, node.least ?? Number.NEGATIVE_INFINITY),
    node.most ?? Number.POSITIVE_INFINITY,
  );
  const value = (node.step ? Math.ceil(near / node.step) * node.step : near) || 0;
  return { value, sure: within(value, node) && !node.checked };
}

function arraySample(node: SchemaNode, read: NodeReader, depth: number): Sample {
  const count = node.least ?? 0;
  if (count > MAX_ITEMS) return { value: [], sure: false };
  const fits = within(count, node) && !node.checked;
  if (count === 0) return { value: [], sure: fits };
  const item = sampleOf(read(node.element), read, depth);
  return { value: Array.from({ length: count }, () => item.value), sure: fits && item.sure };
}

function unionSample(node: SchemaNode, read: NodeReader, depth: number): Sample {
  let first: Sample | undefined;
  for (const option of node.options ?? []) {
    const sample = sampleOf(read(option), read, depth);
    if (sample.sure) return sample;
    first ??= sample;
  }
  return first ?? UNSURE;
}

function kindSample(node: SchemaNode, read: NodeReader, depth: number): Sample {
  switch (node.kind) {
    case "string":
      return stringSample(node);
    case "number":
      return numberSample(node);
    case "boolean":
      return { value: false, sure: !node.checked };
    case "null":
      return { value: null, sure: true };
    case "enum":
    case "literal":
      return node.values?.length ? { value: node.values[0], sure: !node.checked } : UNSURE;
    case "union":
      return unionSample(node, read, depth);
    case "array":
      return arraySample(node, read, depth);
    case "record":
      return { value: {}, sure: !node.checked };
    case "object":
      if (depth >= MAX_DEPTH) return { value: {}, sure: !node.fields?.length };
      return objectSample(node.fields ?? [], read, depth + 1);
    case "unknown":
      return { value: "", sure: !node.checked };
    default:
      /* A bigint or a date, which JSON holds neither of; a number, as the Playground always gave. */
      return node.kind === "bigint" ? { value: numberSample(node).value, sure: false } : UNSURE;
  }
}

/* A schema that may be null takes null when nothing surer is known. */
function sampleOf(node: SchemaNode | undefined, read: NodeReader, depth: number): Sample {
  if (!node) return UNSURE;
  const sample = kindSample(node, read, depth);
  return !sample.sure && node.nullable ? { value: null, sure: true } : sample;
}

/* Every field the object requires, and each it may go without whose value it is known to take. */
function objectSample(
  fields: readonly NodeField[],
  read: NodeReader,
  depth: number,
): { value: Record<string, unknown>; sure: boolean } {
  const value: Record<string, unknown> = {};
  let sure = true;
  for (const field of fields) {
    const node = read(field.schema);
    const sample = sampleOf(node, read, depth);
    if (!sample.sure && (field.optional ?? node?.optional ?? false)) continue;
    /* A key of its own: assigned, a field `__proto__` set the sample's prototype instead. */
    Object.defineProperty(value, field.name, {
      value: sample.value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    sure &&= sample.sure;
  }
  return { value, sure };
}

/**
 * Sample variables for an endpoint, read from its variables schema — Zod
 * (v4 or v3), Valibot, or any schema with a `toJsonSchema()` such as
 * ArkType's — so a Playground call sent as it is passes the schema: each
 * field a value of its kind within the bounds it declares — an enum's or
 * a literal's first value, the first option of a union its schema takes,
 * a sample of a known string format, a nested object filled in the same
 * way. A field whose schema checks more than can be read — a pattern, a
 * refinement, a date — is left out when it may be, and is given the
 * nearest value of its kind when it is required.
 *
 * @param schema - The endpoint's variables schema
 * @returns `{ field: sample }`, or `undefined` when the schema is not an
 *   object schema it can read or no field is given a value
 * @example
 * ```ts
 * extractSchemaStub(z.object({ every: z.number().int().min(100), tag: z.enum(["a", "b"]) }));
 * // → { every: 100, tag: "a" }
 * ```
 */
export function extractSchemaStub(schema: unknown): Record<string, unknown> | undefined {
  try {
    const reader = readerOf(schema);
    const root = reader?.read(reader.root);
    if (!reader || root?.kind !== "object" || !root.fields) return undefined;
    const { value } = objectSample(root.fields, reader.read, 1);
    return Object.keys(value).length > 0 ? value : undefined;
  } catch (error) {
    /* A getter of the schema threw — a lazy schema that cannot be read yet. */
    log.debug("Could not read a variables schema for sample variables", error);
    return undefined;
  }
}
