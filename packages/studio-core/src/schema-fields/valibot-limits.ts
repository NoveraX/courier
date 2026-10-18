import { member } from "../member";
import { FORMAT_SAMPLES } from "./format-samples";
import type { NodeLimits } from "./schema-node";
import { listOf } from "./schema-node";
import { tighten } from "./tighten";

/* Transformations a check after them still reads the value as it came for. */
const KEEPS_KIND = new Set(["trim", "trim_start", "trim_end", "to_lower_case", "to_upper_case"]);

function readAction(limits: NodeLimits, type: unknown, requirement: unknown): void {
  switch (type) {
    case "min_length":
    case "min_value":
      tighten(limits, "least", requirement);
      break;
    case "max_length":
    case "max_value":
      tighten(limits, "most", requirement);
      break;
    case "length":
      tighten(limits, "least", requirement);
      tighten(limits, "most", requirement);
      break;
    case "gt_value":
      tighten(limits, "least", requirement, true);
      break;
    case "lt_value":
      tighten(limits, "most", requirement, true);
      break;
    case "non_empty":
      tighten(limits, "least", 1);
      break;
    case "multiple_of":
      if (typeof requirement === "number") limits.step = requirement;
      break;
    case "integer":
    case "safe_integer":
    case "finite":
      break;
    default:
      if (typeof type === "string" && FORMAT_SAMPLES.has(type)) limits.format = type;
      else limits.checked = true;
  }
}

/**
 * The bounds and the format a Valibot string, number or array declares,
 * read from the validations its pipe holds. A validation it has no reading
 * for, or one after a transformation that may change the value's kind,
 * marks the limits `checked`.
 *
 * @param schema - The schema, `v.pipe(v.string(), v.minLength(3))`
 * @returns The limits
 * @example
 * ```ts
 * valibotLimits(v.pipe(v.string(), v.email())); // { format: "email" }
 * ```
 */
export function valibotLimits(schema: unknown): NodeLimits {
  const limits: NodeLimits = {};
  let reshaped = false;
  for (const action of listOf(member(schema, "pipe"))) {
    const kind = member(action, "kind");
    const type = member(action, "type");
    if (kind === "transformation") {
      reshaped ||= !(typeof type === "string" && KEEPS_KIND.has(type));
    } else if (kind === "validation") {
      if (reshaped) limits.checked = true;
      else readAction(limits, type, member(action, "requirement"));
    }
  }
  return limits;
}
