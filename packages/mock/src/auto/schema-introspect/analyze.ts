/**
 * Main schema field analysis — dispatches to type-specific extractors.
 * Handles all Zod v3/v4 and Valibot types including compound schemas.
 */

import { getFieldType, isTransparentWrapper } from "./detect";
import { extractShape } from "./extract";
import type { FieldMeta, FieldType } from "./types";
import {
  getArrayElement,
  getDefaultValue,
  getDiscriminator,
  getEffectsSchema,
  getEnumValues,
  getInnerType,
  getLiteralValue,
  getNumberConstraints,
  getRecordValueType,
  getTupleItems,
  getUnionOptions,
  resolveLazy,
} from "./unwrap";

const MAX_DEPTH = 10;

/** Analyze a raw field schema into structured FieldMeta */
export function analyzeField(field: unknown, depth = 0): FieldMeta {
  if (depth > MAX_DEPTH) return { type: "unknown" };

  // Transparently unwrap wrappers: default, transform, brand, readonly, lazy, effects
  if (isTransparentWrapper(field)) {
    const inner = getInnerType(field) ?? getEffectsSchema(field) ?? resolveLazy(field);
    const defaultVal = getDefaultValue(field);
    const meta = inner ? analyzeField(inner, depth + 1) : { type: "unknown" as FieldType };
    return { ...meta, ...(defaultVal !== undefined && { defaultValue: defaultVal }) };
  }

  const type = getFieldType(field);
  const next = (f: unknown) => analyzeField(f, depth + 1);

  switch (type) {
    case "optional":
    case "nullable": {
      const inner = getInnerType(field);
      const defaultVal = getDefaultValue(field);
      return {
        type,
        innerField: inner ? next(inner) : undefined,
        ...(defaultVal !== undefined && { defaultValue: defaultVal }),
      };
    }

    case "enum":
      return { type, enumValues: getEnumValues(field) };

    case "number":
      return { type, ...getNumberConstraints(field) };

    case "array": {
      const element = getArrayElement(field);
      return { type, innerField: element ? next(element) : undefined };
    }

    case "object":
      return { type, shape: extractShape(field) };

    case "literal":
      return { type, literalValue: getLiteralValue(field) };

    case "union": {
      const options = getUnionOptions(field);
      const discriminator = getDiscriminator(field);
      return {
        type,
        variants: options?.map(next),
        ...(discriminator && { discriminator }),
      };
    }

    case "tuple": {
      const tupleItems = getTupleItems(field);
      return { type, items: tupleItems?.map(next) };
    }

    case "record": {
      const valueType = getRecordValueType(field);
      return { type, valueField: valueType ? next(valueType) : undefined };
    }

    default:
      return { type };
  }
}
