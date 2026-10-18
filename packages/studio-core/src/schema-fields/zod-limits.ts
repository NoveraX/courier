import { member } from "../member";
import { FORMAT_SAMPLES } from "./format-samples";
import type { NodeLimits } from "./schema-node";
import { listOf } from "./schema-node";
import { tighten } from "./tighten";

/* A format with a sample, unless the check asks for a precision the sample may not have. */
function readFormat(limits: NodeLimits, format: unknown, check: unknown): void {
  const precise = typeof member(check, "precision") === "number";
  if (typeof format === "string" && FORMAT_SAMPLES.has(format) && !precise) limits.format = format;
  else limits.checked = true;
}

function readV4Check(limits: NodeLimits, check: unknown): void {
  const value = member(check, "value");
  const open = member(check, "inclusive") !== true;
  switch (member(check, "check")) {
    case undefined:
    case "number_format":
    case "overwrite":
      break;
    case "min_length":
      tighten(limits, "least", member(check, "minimum"));
      break;
    case "max_length":
      tighten(limits, "most", member(check, "maximum"));
      break;
    case "length_equals":
      tighten(limits, "least", member(check, "length"));
      tighten(limits, "most", member(check, "length"));
      break;
    case "greater_than":
      tighten(limits, "least", value, open);
      break;
    case "less_than":
      tighten(limits, "most", value, open);
      break;
    case "multiple_of":
      if (typeof value === "number") limits.step = value;
      break;
    case "string_format":
      readFormat(limits, member(check, "format"), check);
      break;
    default:
      limits.checked = true;
  }
}

/**
 * The bounds and the format a Zod v4 string, number or array declares, read
 * from its checks — and from its own definition, which a format's schema,
 * `z.email()`, is a check of itself. A check it has no reading for marks the
 * limits `checked`.
 *
 * @param def - The schema's definition, `schema._zod.def`
 * @returns The limits
 * @example
 * ```ts
 * zodV4Limits(z.string().min(3)._zod.def); // { least: 3 }
 * ```
 */
export function zodV4Limits(def: unknown): NodeLimits {
  const limits: NodeLimits = {};
  readV4Check(limits, def);
  for (const check of listOf(member(def, "checks"))) {
    readV4Check(limits, member(member(check, "_zod"), "def"));
  }
  return limits;
}

function readV3Check(limits: NodeLimits, check: unknown): void {
  const kind = member(check, "kind");
  const value = member(check, "value");
  const open = member(check, "inclusive") === false;
  switch (kind) {
    case "min":
      tighten(limits, "least", value, open);
      break;
    case "max":
      tighten(limits, "most", value, open);
      break;
    case "length":
      tighten(limits, "least", value);
      tighten(limits, "most", value);
      break;
    case "multipleOf":
      if (typeof value === "number") limits.step = value;
      break;
    case "int":
    case "finite":
    case "trim":
    case "toLowerCase":
    case "toUpperCase":
      break;
    case "ip":
      readFormat(limits, member(check, "version") === "v6" ? "ipv6" : "ipv4", check);
      break;
    default:
      readFormat(limits, kind, check);
      break;
  }
}

/**
 * The bounds and the format a Zod v3 string, number or array declares: a
 * string's or a number's from its checks, an array's from its lengths.
 *
 * @param def - The schema's definition, `schema._def`
 * @returns The limits
 * @example
 * ```ts
 * zodV3Limits(z3.number().gt(4)._def); // { least: 5 }
 * ```
 */
export function zodV3Limits(def: unknown): NodeLimits {
  const limits: NodeLimits = {};
  for (const check of listOf(member(def, "checks"))) readV3Check(limits, check);
  const exact = member(member(def, "exactLength"), "value");
  tighten(limits, "least", member(member(def, "minLength"), "value"));
  tighten(limits, "most", member(member(def, "maxLength"), "value"));
  tighten(limits, "least", exact);
  tighten(limits, "most", exact);
  return limits;
}
