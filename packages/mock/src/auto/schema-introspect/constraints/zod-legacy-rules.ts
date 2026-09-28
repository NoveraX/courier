import { prop } from "../prop";
import type { FieldType } from "../types";
import type { ConstraintRule } from "./types";

/* Zod v3 string checks that name a kind of value rather than a bound. */
const FORMAT_KINDS = new Set([
  "email",
  "url",
  "uuid",
  "cuid",
  "cuid2",
  "ulid",
  "nanoid",
  "datetime",
  "date",
  "time",
  "ip",
  "emoji",
  "base64",
]);

/**
 * Read the checks of a Zod v3 schema. Its `min` and `max` checks bound a
 * number's value but a string's length, so the field's type decides which.
 *
 * @param field A Zod v3 schema, or any other value (which yields no rules)
 * @param type  The field's detected type
 * @returns The rules its checks declare
 * @example
 * ```ts
 * zodLegacyRules(z3.string().max(8), "string");
 * // [{ kind: "maxLength", value: 8 }]
 * ```
 */
export function zodLegacyRules(field: unknown, type: FieldType): ConstraintRule[] {
  if (prop(field, "_zod") !== undefined) return [];
  if (type === "array") return arrayRules(field);
  const checks = prop(field, "_def", "checks");
  if (!Array.isArray(checks)) return [];
  return checks.flatMap((check) => checkRules(check, type === "string"));
}

function arrayRules(field: unknown): ConstraintRule[] {
  const rules: ConstraintRule[] = [];
  const exact = prop(field, "_def", "exactLength", "value");
  const min = prop(field, "_def", "minLength", "value");
  const max = prop(field, "_def", "maxLength", "value");
  if (typeof exact === "number") rules.push({ kind: "length", value: exact });
  if (typeof min === "number") rules.push({ kind: "minLength", value: min });
  if (typeof max === "number") rules.push({ kind: "maxLength", value: max });
  return rules;
}

function checkRules(check: unknown, isString: boolean): ConstraintRule[] {
  const kind = prop(check, "kind");
  const value = prop(check, "value");
  if (kind === "min" || kind === "max") return boundRule(kind, value, check, isString);
  if (kind === "length" && typeof value === "number") return [{ kind: "length", value }];
  if (kind === "int") return [{ kind: "integer" }];
  if (kind === "multipleOf" && typeof value === "number") return [{ kind: "multipleOf", value }];
  const regex = prop(check, "regex");
  if (kind === "regex" && regex instanceof RegExp) return [{ kind: "pattern", pattern: regex }];
  if (kind === "startsWith" && typeof value === "string") return [{ kind: "startsWith", value }];
  if (kind === "endsWith" && typeof value === "string") return [{ kind: "endsWith", value }];
  if (kind === "includes" && typeof value === "string") return [{ kind: "includes", value }];
  if (typeof kind === "string" && FORMAT_KINDS.has(kind)) {
    return [{ kind: "format", format: kind === "ip" ? "ipv4" : kind }];
  }
  return [];
}

function boundRule(
  kind: "min" | "max",
  value: unknown,
  check: unknown,
  isString: boolean,
): ConstraintRule[] {
  if (typeof value !== "number") return [];
  if (isString) return [{ kind: kind === "min" ? "minLength" : "maxLength", value }];
  return [{ kind, value, inclusive: prop(check, "inclusive") !== false }];
}
