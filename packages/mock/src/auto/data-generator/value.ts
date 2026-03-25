/**
 * Value generation dispatcher — routes to type-specific generators.
 * Handles depth limiting to prevent infinite recursion on self-referencing schemas.
 */

import { generateNumber } from "../gen-number";
import { generateDateString, generateString } from "../gen-string";
import type { FieldMeta } from "../schema-introspect";

import type { ValueGenerator } from "./compound";
import {
  generateArray,
  generateObject,
  generateRecordValue,
  generateTuple,
  generateUnionValue,
} from "./compound";
import type { EntityContext } from "./context";
import { generateBoolean } from "./context";

const MAX_DEPTH = 3;

/** Generate a value for a field, respecting depth limits for compound types */
export function generateValue(
  key: string,
  meta: FieldMeta,
  index: number,
  context: EntityContext = "generic",
  depth = 0,
): unknown {
  // Default values take priority — schema-declared constant
  if (meta.defaultValue !== undefined) return meta.defaultValue;

  // Unwrap optional/nullable → generate inner value
  if (meta.type === "optional" || meta.type === "nullable") {
    if (meta.innerField) return generateValue(key, meta.innerField, index, context, depth);
    return null;
  }

  // Literal — return constant
  if (meta.type === "literal") return meta.literalValue;

  // Enum — cycle through values
  if (meta.type === "enum" && meta.enumValues?.length) {
    return meta.enumValues[index % meta.enumValues.length];
  }

  // Compound types — depth-limited to prevent infinite recursion
  const nextGen: ValueGenerator = (k, m, i, c) => generateValue(k, m, i, c, depth + 1);
  const atLimit = depth >= MAX_DEPTH;

  switch (meta.type) {
    case "string":
      return generateString(key, index, context);
    case "number":
    case "bigint":
      return generateNumber(key, index, meta);
    case "boolean":
      return generateBoolean(key, index);
    case "date":
      return generateDateString(index);
    case "array":
      return atLimit ? [] : generateArray(key, meta, index, context, nextGen);
    case "object":
      return atLimit ? {} : generateObject(meta, index, context, nextGen);
    case "tuple":
      return atLimit ? [] : generateTuple(key, meta, index, context, nextGen);
    case "record":
      return atLimit ? {} : generateRecordValue(meta, index, context, nextGen);
    case "union":
      return atLimit ? null : generateUnionValue(key, meta, index, context, nextGen);
    default:
      return generateString(key, index, context);
  }
}
