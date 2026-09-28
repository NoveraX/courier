import { prop } from "../prop";
import type { ConstraintRule } from "./types";

const INTEGER_FORMATS = new Set(["safeint", "int32", "uint32", "int64", "uint64"]);
const UNSIGNED_FORMATS = new Set(["uint32", "uint64"]);

/* String formats that are only a pattern, or a substring rule, rather than
   a kind of value a generator can produce. */
const PATTERN_ONLY_FORMATS = new Set(["regex", "lowercase", "uppercase"]);

/**
 * Read the checks of a Zod v4 schema. A format schema such as `z.email()` or
 * `z.int()` is itself a check, so its own definition is read along with the
 * checks chained onto it.
 *
 * @param field A Zod v4 schema, or any other value (which yields no rules)
 * @returns The rules its checks declare
 * @example
 * ```ts
 * zodRules(z.number().int().min(21));
 * // [{ kind: "integer" }, { kind: "min", value: 21, inclusive: true }]
 * ```
 */
export function zodRules(field: unknown): ConstraintRule[] {
  const def = prop(field, "_zod", "def");
  if (!def || typeof def !== "object") return [];
  const checks = prop(def, "checks");
  const chained = Array.isArray(checks) ? checks.map((check) => prop(check, "_zod", "def")) : [];
  return [def, ...chained].flatMap(checkRules);
}

function checkRules(def: unknown): ConstraintRule[] {
  switch (prop(def, "check")) {
    case "greater_than":
      return boundRule("min", def);
    case "less_than":
      return boundRule("max", def);
    case "number_format":
      return numberFormatRules(prop(def, "format"));
    case "multiple_of":
      return numberRule("multipleOf", prop(def, "value"));
    case "min_length":
      return numberRule("minLength", prop(def, "minimum"));
    case "max_length":
      return numberRule("maxLength", prop(def, "maximum"));
    case "length_equals":
      return numberRule("length", prop(def, "length"));
    case "string_format":
      return stringFormatRules(def);
    default:
      return [];
  }
}

function boundRule(kind: "min" | "max", def: unknown): ConstraintRule[] {
  const value = prop(def, "value");
  if (typeof value !== "number") return [];
  return [{ kind, value, inclusive: prop(def, "inclusive") === true }];
}

function numberRule(
  kind: "multipleOf" | "minLength" | "maxLength" | "length",
  value: unknown,
): ConstraintRule[] {
  return typeof value === "number" ? [{ kind, value }] : [];
}

function numberFormatRules(format: unknown): ConstraintRule[] {
  if (typeof format !== "string" || !INTEGER_FORMATS.has(format)) return [];
  const rules: ConstraintRule[] = [{ kind: "integer" }];
  if (UNSIGNED_FORMATS.has(format)) rules.push({ kind: "min", value: 0, inclusive: true });
  return rules;
}

function stringFormatRules(def: unknown): ConstraintRule[] {
  const rules = affixRules(def);
  const format = prop(def, "format");
  const isNamedFormat = typeof format === "string" && rules.length === 0;
  if (isNamedFormat && !PATTERN_ONLY_FORMATS.has(format)) rules.push({ kind: "format", format });
  const pattern = prop(def, "pattern");
  if (pattern instanceof RegExp) rules.push({ kind: "pattern", pattern });
  return rules;
}

function affixRules(def: unknown): ConstraintRule[] {
  const prefix = prop(def, "prefix");
  if (typeof prefix === "string") return [{ kind: "startsWith", value: prefix }];
  const suffix = prop(def, "suffix");
  if (typeof suffix === "string") return [{ kind: "endsWith", value: suffix }];
  const includes = prop(def, "includes");
  if (typeof includes === "string") return [{ kind: "includes", value: includes }];
  return [];
}
