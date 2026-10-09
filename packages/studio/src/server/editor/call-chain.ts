import type { Argument, Expression } from "oxc-parser";

/** The names a call is made through, and what it is made on. */
export interface CallChain {
  /** The member names after the root, in order: `["live", "orders"]` for `storefront.live.orders()` */
  readonly names: readonly string[];
  /** Where each name is written: offsets of its first and past its last character */
  readonly spans: readonly (readonly [number, number])[];
  /** The variable the chain starts from — `storefront` — or `undefined` for anything else */
  readonly root: string | undefined;
}

/* Wrappers that change nothing about what a chain calls: `api!.users`, `(api).users`, `api as Api`. */
const TRANSPARENT = new Set([
  "TSNonNullExpression",
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSSatisfiesExpression",
]);

/**
 * The member chain a call goes through — `storefront.live.orders` — or
 * `undefined` when the callee is not one: a plain function, or a member
 * named by an expression that is not a string.
 *
 * @param callee - The call's callee
 * @returns Its names and its root
 * @example
 * ```ts
 * chainOf(call.callee)?.names; // ["live", "orders"]
 * ```
 */
export function chainOf(callee: Expression): CallChain | undefined {
  const names: string[] = [];
  const spans: (readonly [number, number])[] = [];
  let node: Expression = callee;
  for (;;) {
    if (TRANSPARENT.has(node.type) && "expression" in node) {
      node = node.expression as Expression;
      continue;
    }
    if (node.type !== "MemberExpression") break;
    const name = memberName(node.property);
    if (name === undefined) return undefined;
    names.unshift(name);
    spans.unshift([node.property.start, node.property.end]);
    node = node.object;
  }
  if (names.length === 0) return undefined;
  const root =
    node.type === "Identifier" ? node.name : node.type === "ThisExpression" ? "this" : undefined;
  return { names, spans, root };
}

/**
 * A string an argument holds as written: a string literal, or a template
 * with nothing interpolated.
 *
 * @param argument - The argument
 * @returns The string, or `undefined`
 * @example
 * ```ts
 * literalString(call.arguments[0]); // "getAll", for q.users.useQuery("getAll")
 * ```
 */
export function literalString(argument: Argument | undefined): string | undefined {
  if (argument === undefined) return undefined;
  if (argument.type === "Literal" && typeof argument.value === "string") return argument.value;
  if (argument.type === "TemplateLiteral" && argument.expressions.length === 0) {
    return argument.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
}

function memberName(property: Expression | { type: string; name?: string }): string | undefined {
  if (property.type === "Identifier" && "name" in property && typeof property.name === "string") {
    return property.name;
  }
  if (property.type === "Literal" || property.type === "TemplateLiteral") {
    return literalString(property as Argument);
  }
  return undefined;
}
