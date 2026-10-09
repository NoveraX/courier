/** JSON Schema 2020-12, as an OpenAPI 3.1 document holds it. */
export type JsonSchema = Record<string, unknown>;

type ValueType = "string" | "number" | "boolean" | "null" | "object" | "array";

/** What the values seen at one place were. */
interface Seen {
  types: Set<ValueType>;
  /** How many objects were seen here, and each field with how many of them held it */
  objects: number;
  fields: Map<string, Seen>;
  fieldCounts: Map<string, number>;
  items: Seen | undefined;
  /** How many strings were seen, and how many of them matched each format */
  strings: number;
  formats: Map<string, number>;
}

/* A schema read from samples stays small, however large they are. */
const DEEPEST = 10;
const MOST_FIELDS = 200;
const ITEMS_READ = 50;

const FORMATS: ReadonlyArray<readonly [string, RegExp]> = [
  ["date-time", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/],
  ["date", /^\d{4}-\d{2}-\d{2}$/],
  ["uuid", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i],
  ["email", /^[^\s@]+@[^\s@]+\.[^\s@]+$/],
  ["uri", /^https?:\/\/\S+$/],
];

/**
 * A JSON Schema that takes every sample given — the answers an endpoint
 * gave, the bodies it was sent — merged: an object's fields from every
 * sample, required when every sample held them; the types each place came
 * as, `null` among them making it nullable; an array's items merged; a
 * string's format when every string there had it. Numbers stay numbers,
 * since a few samples cannot tell a price of 12 from an integer; no value is
 * written into the schema.
 *
 * A schema read from a few samples can be stricter than the API, so each
 * field says it was inferred, and from how many of them: `Inferred from
 * traffic: in 7 of 12 answers.` The code generated from it carries that on
 * the field, where a person reviewing it finds it.
 *
 * @param samples - The values seen
 * @param noun - What the samples are, for the fields' notes: `answers`, `requests`
 * @returns The schema
 * @example
 * ```ts
 * schemaOfSamples([{ id: "a", tags: [] }, { id: "b", note: null }], "answers");
 * // { type: "object", properties: { id: …, tags: …, note: … }, required: ["id"] }
 * ```
 */
export function schemaOfSamples(samples: readonly unknown[], noun = "samples"): JsonSchema {
  const seen = emptySeen();
  for (const sample of samples) add(seen, sample, 0);
  return schemaOf(seen, noun);
}

function emptySeen(): Seen {
  return {
    types: new Set(),
    objects: 0,
    fields: new Map(),
    fieldCounts: new Map(),
    items: undefined,
    strings: 0,
    formats: new Map(),
  };
}

function add(seen: Seen, value: unknown, depth: number): void {
  if (depth > DEEPEST) return;
  if (value === null || value === undefined) seen.types.add("null");
  else if (Array.isArray(value)) {
    seen.types.add("array");
    seen.items ??= emptySeen();
    for (const item of value.slice(0, ITEMS_READ)) add(seen.items, item, depth + 1);
  } else if (typeof value === "object") {
    seen.types.add("object");
    seen.objects++;
    const entries: Array<[string, unknown]> = Object.entries(value);
    for (const [key, inner] of entries) {
      if (!seen.fields.has(key) && seen.fields.size >= MOST_FIELDS) continue;
      const field = seen.fields.get(key) ?? emptySeen();
      seen.fields.set(key, field);
      seen.fieldCounts.set(key, (seen.fieldCounts.get(key) ?? 0) + 1);
      add(field, inner, depth + 1);
    }
  } else if (typeof value === "string") {
    seen.types.add("string");
    seen.strings++;
    for (const [format, test] of FORMATS) {
      if (test.test(value)) seen.formats.set(format, (seen.formats.get(format) ?? 0) + 1);
    }
  } else if (typeof value === "number") seen.types.add("number");
  else if (typeof value === "boolean") seen.types.add("boolean");
}

function schemaOf(seen: Seen, noun: string): JsonSchema {
  const nullable = seen.types.has("null");
  const kinds = [...seen.types]
    .filter((type) => type !== "null")
    .map((type) => typedOf(type, seen, noun));
  if (kinds.length === 0) return nullable ? { type: "null" } : {};
  if (kinds.length === 1) {
    const [only] = kinds;
    if (!nullable || only === undefined) return only ?? {};
    return typeof only.type === "string"
      ? { ...only, type: [only.type, "null"] }
      : { anyOf: [only, { type: "null" }] };
  }
  return { anyOf: nullable ? [...kinds, { type: "null" }] : kinds };
}

function typedOf(type: Exclude<ValueType, "null">, seen: Seen, noun: string): JsonSchema {
  if (type === "array")
    return { type: "array", ...(seen.items && { items: schemaOf(seen.items, "items") }) };
  if (type === "object") {
    const properties = Object.fromEntries(
      [...seen.fields].map(([key, field]) => [
        key,
        {
          ...schemaOf(field, key === "" ? "objects" : `${key} objects`),
          description: inferredNote(seen.fieldCounts.get(key) ?? 0, seen.objects, noun),
        },
      ]),
    );
    const required = [...seen.fieldCounts]
      .filter(([, count]) => count === seen.objects)
      .map(([key]) => key);
    return { type: "object", properties, ...(required.length > 0 && { required }) };
  }
  if (type === "string") {
    const format = [...seen.formats].find(([, count]) => count === seen.strings)?.[0];
    return { type: "string", ...(format && { format }) };
  }
  return { type };
}

/* How many of the objects at its place held a field: `in 7 of 12 answers`, `in all 5 seller objects`. */
function inferredNote(held: number, of: number, noun: string): string {
  if (of === 1) return `Inferred from traffic: from the one ${noun.replace(/s$/, "")} seen.`;
  if (held === of) return `Inferred from traffic: in ${of === 2 ? "both" : `all ${of}`} ${noun}.`;
  return `Inferred from traffic: in ${held} of ${of} ${noun}.`;
}
