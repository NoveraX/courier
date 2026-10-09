import type { Expression } from "oxc-parser";

import type { TextEdit } from "../../mocks-edit/types";
import type { Drift } from "../endpoint-drift";
import { zodOfTypes } from "../zod-of-types";

/* The calls at a field schema's end that say whether it may be absent or empty, and how it reads — kept outside a new union. */
const TRAILING: ReadonlySet<string> = new Set([
  "optional",
  "nullable",
  "nullish",
  "default",
  "prefault",
  "catch",
  "describe",
  "meta",
]);

/**
 * The edit that changes one field's schema: to take a type it came as —
 * beside its own when some answers still came as that, in its place when
 * none did — to be optional, or both. What the schema constrains stays in
 * it, and its trailing modifiers stay at its end: `z.number().int().optional()`
 * that came as a string too becomes
 * `z.union([z.number().int(), z.string()]).optional()`.
 *
 * @param text - The module's text
 * @param value - The field's schema expression
 * @param type - How its type differs, when it does
 * @param optional - Whether it becomes optional
 * @returns The replacement of the expression, or `undefined` when nothing changes
 * @example
 * ```ts
 * changedValue(text, property.value, undefined, true); // { start, end, text: "z.string().optional()" }
 * ```
 */
export function changedValue(
  text: string,
  value: Expression,
  type: Drift | undefined,
  optional: boolean,
): TextEdit | undefined {
  const inner = innerOf(value);
  const suffix = text.slice(inner.end, value.end);
  const written = text.slice(inner.start, inner.end);
  const typed = type === undefined ? written : retyped(written, type, suffix);
  const optionalAlready = /\.(?:optional|nullish)\(\s*\)/.test(suffix);
  const result = `${typed}${suffix}${optional && !optionalAlready ? ".optional()" : ""}`;
  return result === text.slice(value.start, value.end)
    ? undefined
    : { start: value.start, end: value.end, text: result };
}

/* The schema without its trailing modifiers: `z.number().int()` of `z.number().int().optional()`. */
function innerOf(value: Expression): Expression {
  let inner = value;
  while (
    inner.type === "CallExpression" &&
    inner.callee.type === "MemberExpression" &&
    !inner.callee.computed &&
    inner.callee.property.type === "Identifier" &&
    TRAILING.has(inner.callee.property.name)
  ) {
    inner = inner.callee.object;
  }
  return inner;
}

function retyped(written: string, type: Drift, suffix: string): string {
  if (!type.alsoFits) return zodOfTypes(type.observed);
  const declared = new Set(type.declared ?? []);
  const added = type.observed.filter((observed) => !declared.has(observed) && observed !== "any");
  const scalars = added.filter((observed) => observed !== "null");
  const nullable =
    added.includes("null") && !/\.(?:nullable|nullish)\(\s*\)/.test(suffix) ? ".nullable()" : "";
  if (scalars.length === 0) return `${written}${nullable}`;
  const members = [written, ...scalars.map((scalar) => zodOfTypes([scalar]))];
  return `z.union([${members.join(", ")}])${nullable}`;
}
