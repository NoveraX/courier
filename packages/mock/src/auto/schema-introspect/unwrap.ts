/**
 * Helpers to extract inner data from schema wrapper types.
 * Supports Zod v3, Zod v4, and Valibot across all container types.
 */

import { isRecord } from "../../is-record";
import { prop, readDef } from "./prop";

/** Get inner type from optional/nullable/default wrappers */
export function getInnerType(field: unknown): unknown {
  return readDef(field, "innerType", "wrapped");
}

/** Get inner schema from ZodEffects (refine/transform/preprocess) */
export function getEffectsSchema(field: unknown): unknown {
  return prop(field, "_def", "schema");
}

/** Get lazy schema getter and resolve it */
export function resolveLazy(field: unknown): unknown {
  const getter = readDef(field, "getter");
  if (typeof getter === "function") {
    try {
      return (getter as () => unknown)();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Get array element schema */
export function getArrayElement(field: unknown): unknown {
  return (
    readDef(field, "element", "item") ?? prop(field, "_def", "type") // Zod v3 ZodArray uses _def.type
  );
}

/** Get the values an enum holds: strings, and a native enum's numbers */
export function getEnumValues(field: unknown): Array<string | number> | undefined {
  // Zod v4: _def.entries → { "pending": "pending", ... }
  const v4Entries = prop(field, "_def", "entries");
  if (isRecord(v4Entries)) return Object.values(v4Entries).filter(isEnumValue);

  // Zod v4 alt / v3: values array
  const values = readDef(field, "values");
  if (Array.isArray(values)) return values.map(String);

  // Zod v3 nativeEnum: values as object { A: "a", B: 1 }
  if (isRecord(values)) {
    return Object.values(values).filter((v): v is string => typeof v === "string");
  }

  // Valibot picklist: options (array of strings)
  const options = prop(field, "options");
  if (Array.isArray(options) && options.every((o): o is string => typeof o === "string")) {
    return options;
  }

  return undefined;
}

/** Get literal constant value */
export function getLiteralValue(field: unknown): unknown {
  // Zod v4 stores literals as `values: [val]` array
  const values = readDef(field, "values");
  if (Array.isArray(values) && values.length > 0) return values[0];

  // Zod v3 / Valibot: direct value
  return readDef(field, "value", "literal");
}

/** Get union/discriminatedUnion option schemas */
export function getUnionOptions(field: unknown): unknown[] | undefined {
  const options = readDef(field, "options");
  if (Array.isArray(options)) return options;
  return undefined;
}

/** Get discriminator key for discriminated unions */
export function getDiscriminator(field: unknown): string | undefined {
  const key = readDef(field, "discriminator", "key");
  return typeof key === "string" ? key : undefined;
}

/** Get tuple item schemas (ordered) */
export function getTupleItems(field: unknown): unknown[] | undefined {
  const items = readDef(field, "items");
  if (Array.isArray(items)) return items;
  return undefined;
}

/** Get record value type schema */
export function getRecordValueType(field: unknown): unknown {
  return readDef(field, "valueType", "value");
}

/** Get default value from a .default() schema */
export function getDefaultValue(field: unknown): unknown {
  const v = readDef(field, "defaultValue");
  // Zod stores defaults as a factory function
  if (typeof v === "function") {
    try {
      return (v as () => unknown)();
    } catch {
      return undefined;
    }
  }
  return v;
}

/* A value an enum can hold: a native enum's numbers as much as its strings. */
function isEnumValue(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}
