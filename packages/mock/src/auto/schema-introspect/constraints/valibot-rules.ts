import { prop } from "../prop";
import type { ConstraintRule } from "./types";

/* Valibot validation actions that name a kind of value, mapped to the
   format names the generator knows. Their regex requirement, when they have
   one, is added as a pattern as well. */
const FORMAT_ACTIONS = new Map([
  ["email", "email"],
  ["rfc_email", "email"],
  ["url", "url"],
  ["uuid", "uuid"],
  ["iso_date_time", "datetime"],
  ["iso_timestamp", "datetime"],
  ["iso_date", "date"],
  ["iso_time", "time"],
  ["iso_time_second", "time"],
  ["ipv4", "ipv4"],
  ["ipv6", "ipv6"],
  ["ip", "ipv4"],
  ["ulid", "ulid"],
  ["cuid2", "cuid2"],
  ["nanoid", "nanoid"],
]);

const BOUND_ACTIONS = new Map<string, { kind: "min" | "max"; inclusive: boolean }>([
  ["min_value", { kind: "min", inclusive: true }],
  ["gt_value", { kind: "min", inclusive: false }],
  ["max_value", { kind: "max", inclusive: true }],
  ["lt_value", { kind: "max", inclusive: false }],
]);

const LENGTH_ACTIONS = new Map<string, "minLength" | "maxLength" | "length" | "multipleOf">([
  ["min_length", "minLength"],
  ["max_length", "maxLength"],
  ["length", "length"],
  ["multiple_of", "multipleOf"],
]);

const AFFIX_ACTIONS = new Map<string, "startsWith" | "endsWith" | "includes">([
  ["starts_with", "startsWith"],
  ["ends_with", "endsWith"],
  ["includes", "includes"],
]);

/**
 * Read the validation actions of a Valibot `pipe()`.
 *
 * @param field A Valibot schema, or any other value (which yields no rules)
 * @returns The rules its pipe declares
 * @example
 * ```ts
 * valibotRules(v.pipe(v.string(), v.maxLength(4)));
 * // [{ kind: "maxLength", value: 4 }]
 * ```
 */
export function valibotRules(field: unknown): ConstraintRule[] {
  const pipe = prop(field, "pipe");
  if (!Array.isArray(pipe)) return [];
  return pipe.filter((item) => prop(item, "kind") === "validation").flatMap(actionRules);
}

function actionRules(action: unknown): ConstraintRule[] {
  const type = prop(action, "type");
  if (typeof type !== "string") return [];
  const requirement = prop(action, "requirement");
  const rules = requirementRules(type, requirement);
  const format = FORMAT_ACTIONS.get(type);
  if (format) rules.push({ kind: "format", format });
  if (requirement instanceof RegExp) rules.push({ kind: "pattern", pattern: requirement });
  return rules;
}

function requirementRules(type: string, requirement: unknown): ConstraintRule[] {
  if (type === "integer" || type === "safe_integer") return [{ kind: "integer" }];
  if (type === "non_empty") return [{ kind: "minLength", value: 1 }];
  const bound = BOUND_ACTIONS.get(type);
  if (bound && typeof requirement === "number") return [{ ...bound, value: requirement }];
  const length = LENGTH_ACTIONS.get(type);
  if (length && typeof requirement === "number") return [{ kind: length, value: requirement }];
  const affix = AFFIX_ACTIONS.get(type);
  if (affix && typeof requirement === "string") return [{ kind: affix, value: requirement }];
  return [];
}
