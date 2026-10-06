import type { Expression, ObjectExpression, Program } from "oxc-parser";
import { findDefaultExport } from "../mocks-edit/plan/default-export";
import { unwrapExpression } from "../mocks-edit/plan/unwrap-expression";
import { topLevelConst } from "./top-level-const";

/** The object literal a config exports, or what stands in its place. */
export type ConfigObject =
  | { kind: "object"; object: ObjectExpression }
  /** No object Studio can change: `what` completes "The config …". */
  | { kind: "other"; what: string };

/**
 * Find the object literal a config exports as its default — written there,
 * passed to `defineConfig(…)`, behind `satisfies`, `as` or parentheses, or
 * bound to a name by a top-level `const` the default export names.
 *
 * @param program - The parsed config
 * @returns The object, or what the config exports instead
 * @example
 * ```ts
 * // export default defineConfig({ sources: { api } }) satisfies CourierConfig;
 * locateConfigObject(program).kind; // → "object"
 * ```
 */
export function locateConfigObject(program: Program): ConfigObject {
  const found = findDefaultExport(program);
  if (found === null) return other("exports no default");
  switch (found.kind) {
    case "expression":
      return objectIn(found.expression, program, true);
    case "binding": {
      const init = topLevelConst(program, found.name);
      if (init === null) return other(`exports ${found.name}, which no top-level const declares`);
      return objectIn(init, program, false);
    }
    case "several":
      return other("exports more than one default");
    case "type":
      return other("exports only a type as its default");
    case "other":
      return other(`exports ${found.what} as its default`);
  }
}

/* A name is followed once: what a const binds is read as written. */
function objectIn(expression: Expression, program: Program, followName: boolean): ConfigObject {
  const value = unwrapExpression(expression);
  if (value.type === "ObjectExpression") return { kind: "object", object: value };
  if (value.type === "CallExpression") {
    const [first, ...rest] = value.arguments;
    if (first !== undefined && first.type !== "SpreadElement" && rest.length === 0) {
      const argument = unwrapExpression(first);
      if (argument.type === "ObjectExpression") return { kind: "object", object: argument };
    }
    return other("passes its default export through a call Studio cannot see into");
  }
  if (value.type === "Identifier" && followName) {
    const init = topLevelConst(program, value.name);
    if (init !== null) return objectIn(init, program, false);
  }
  return other("builds its default export in a way Studio cannot change");
}

function other(what: string): ConfigObject {
  return { kind: "other", what };
}
