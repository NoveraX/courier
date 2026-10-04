import { createLogger } from "@noverax/courier";

const log = createLogger("Studio");

/**
 * Sample variables for an endpoint, read from its variables schema: Zod (v4
 * or v3) and Valibot object schemas, a value of each field's type, within the
 * lower bound a number or a string declares, so a Playground call sent as it
 * is passes the schema.
 *
 * @param schema - The endpoint's variables schema
 * @returns `{ field: sample }`, or `undefined` when the schema is not an
 *   object schema it can read
 * @example
 * ```ts
 * extractSchemaStub(z.object({ every: z.number().int().min(100) })); // → { every: 100 }
 * ```
 */
export function extractSchemaStub(schema: unknown): Record<string, unknown> | undefined {
  try {
    const fields = member(schema, "shape") ?? member(schema, "entries");
    if (typeof fields !== "object" || fields === null) return undefined;
    const stub: Record<string, unknown> = {};
    for (const key of Object.keys(fields)) stub[key] = sampleOf(member(fields, key));
    return Object.keys(stub).length > 0 ? stub : undefined;
  } catch (error) {
    /* A getter of the schema threw — a lazy schema that cannot be read yet. */
    log.debug("Could not read a variables schema for sample variables", error);
    return undefined;
  }
}

/* What a field holds, by the vendor its schema says it is from. */
function sampleOf(field: unknown): unknown {
  const zodV4 = member(member(field, "_zod"), "def");
  if (zodV4 !== undefined) return sampleByType(member(zodV4, "type"), zodV4, zodV4Bound);
  const zodV3 = member(field, "_def");
  if (zodV3 !== undefined)
    return sampleByType(zodV3Type(member(zodV3, "typeName")), zodV3, zodV3Bound);
  return sampleByType(member(field, "type"), field, valibotBound);
}

type BoundOf = (definition: unknown, kind: "number" | "length") => number | undefined;

function sampleByType(type: unknown, definition: unknown, boundOf: BoundOf): unknown {
  switch (type) {
    case "number":
    case "bigint":
      return Math.max(0, boundOf(definition, "number") ?? 0);
    case "string":
      return "x".repeat(boundOf(definition, "length") ?? 0);
    case "boolean":
      return false;
    case "array":
      return [];
    case "object":
      return {};
    case "optional":
    case "nullable":
      return sampleOf(member(definition, "innerType"));
    default:
      return "";
  }
}

/* Zod v4 keeps each refinement as a check with its own definition. */
function zodV4Bound(definition: unknown, kind: "number" | "length"): number | undefined {
  const wanted = kind === "number" ? "greater_than" : "min_length";
  return highest(member(definition, "checks"), (check) => {
    const checkDef = member(member(check, "_zod"), "def");
    if (member(checkDef, "check") !== wanted) return undefined;
    const value = member(checkDef, kind === "number" ? "value" : "minimum");
    if (typeof value !== "number") return undefined;
    return kind === "number" && member(checkDef, "inclusive") !== true ? value + 1 : value;
  });
}

/* Zod v3 lists them as `{ kind: "min", value, inclusive }`. */
function zodV3Bound(definition: unknown): number | undefined {
  return highest(member(definition, "checks"), (check) => {
    const value = member(check, "value");
    if (member(check, "kind") !== "min" || typeof value !== "number") return undefined;
    return member(check, "inclusive") === false ? value + 1 : value;
  });
}

/* Valibot pipes a schema through actions, `min_value` and `min_length` among them. */
function valibotBound(schema: unknown, kind: "number" | "length"): number | undefined {
  const wanted = kind === "number" ? "min_value" : "min_length";
  return highest(member(schema, "pipe"), (action) => {
    const requirement = member(action, "requirement");
    return member(action, "type") === wanted && typeof requirement === "number"
      ? requirement
      : undefined;
  });
}

function highest(
  list: unknown,
  boundOf: (item: unknown) => number | undefined,
): number | undefined {
  if (!Array.isArray(list)) return undefined;
  let bound: number | undefined;
  for (const item of list) {
    const value = boundOf(item);
    if (value !== undefined && (bound === undefined || value > bound)) bound = value;
  }
  return bound;
}

const ZOD_V3_TYPES: ReadonlyMap<string, string> = new Map([
  ["ZodString", "string"],
  ["ZodNumber", "number"],
  ["ZodBigInt", "bigint"],
  ["ZodBoolean", "boolean"],
  ["ZodArray", "array"],
  ["ZodObject", "object"],
  ["ZodOptional", "optional"],
  ["ZodNullable", "nullable"],
]);

function zodV3Type(typeName: unknown): string | undefined {
  return typeof typeName === "string" ? ZOD_V3_TYPES.get(typeName) : undefined;
}

function member(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && key in value
    ? Reflect.get(value, key)
    : undefined;
}
