import type { FieldType, ValueConstraints } from "../types";
import { applyRule } from "./apply-rule";
import { valibotRules } from "./valibot-rules";
import { zodLegacyRules } from "./zod-legacy-rules";
import { zodRules } from "./zod-rules";

/**
 * Read the checks a schema puts on its values — bounds, integer, length,
 * format, pattern and affixes — whichever library defined it.
 *
 * @param field The raw field schema (Zod v4, Zod v3 or Valibot)
 * @param type  The field's detected type; Zod v3 needs it to read `min`/`max`
 * @returns The constraints a generated value has to satisfy
 * @example
 * ```ts
 * getConstraints(z.number().int().min(21).max(99), "number");
 * // { integer: true, min: 21, exclusiveMin: false, max: 99, exclusiveMax: false }
 * ```
 */
export function getConstraints(field: unknown, type: FieldType): ValueConstraints {
  const constraints: ValueConstraints = {};
  const rules = [...zodRules(field), ...zodLegacyRules(field, type), ...valibotRules(field)];
  for (const rule of rules) applyRule(constraints, rule);
  return constraints;
}
