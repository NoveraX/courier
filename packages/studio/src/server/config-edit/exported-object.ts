import type { Expression, ObjectExpression, Program } from "oxc-parser";
import { findDefaultExport } from "../mocks-edit/plan/default-export";
import { exportName } from "../mocks-edit/plan/export-name";
import { unwrapExpression } from "../mocks-edit/plan/unwrap-expression";
import { topLevelConst } from "./top-level-const";

/** The object literal a module exports under a name, or what it exports instead. */
export type ExportedObject =
  | { kind: "object"; object: ObjectExpression }
  /** No object Studio can change: `what` completes "The module …". */
  | { kind: "other"; what: string };

/**
 * Find the object literal a module exports under `name`: `export const
 * sources = { … }`, `const list = { … }` exported as `export { list as
 * sources }`, or — for `default` — `export default { … }` or a `const` the
 * default export names; behind `satisfies`, `as` or parentheses.
 *
 * @param program - The parsed module
 * @param name - The name the module exports it under, `default` for its default export
 * @returns The object, or what the module exports instead
 * @example
 * ```ts
 * // export const sources = { api } satisfies Record<string, unknown>;
 * exportedObject(program, "sources").kind; // → "object"
 * ```
 */
export function exportedObject(program: Program, name: string): ExportedObject {
  const value = name === "default" ? defaultValue(program) : namedValue(program, name);
  if (typeof value === "string") return other(value);
  const unwrapped = unwrapExpression(value);
  if (unwrapped.type === "ObjectExpression") return { kind: "object", object: unwrapped };
  if (unwrapped.type === "CallExpression") {
    return other(`builds \`${name}\` through a call Studio cannot see into`);
  }
  return other(`builds \`${name}\` in a way Studio cannot change`);
}

/* The value bound to an exported name: a `const` exported as declared, or exported by a specifier. */
function namedValue(program: Program, name: string): Expression | string {
  for (const statement of program.body) {
    if (statement.type !== "ExportNamedDeclaration") continue;
    const declaration = statement.declaration;
    if (declaration?.type === "VariableDeclaration") {
      const declared = declaration.declarations.some(
        (d) => d.id.type === "Identifier" && d.id.name === name,
      );
      if (!declared) continue;
      if (declaration.kind !== "const") return `declares \`${name}\` with ${declaration.kind}`;
      return topLevelConst(program, name) ?? `declares \`${name}\` without a value`;
    }
    if (statement.source !== null || declaration !== null) continue;
    for (const specifier of statement.specifiers) {
      if (exportName(specifier.exported) !== name) continue;
      const local = exportName(specifier.local);
      return (
        topLevelConst(program, local) ?? `exports \`${name}\`, which no top-level const declares`
      );
    }
  }
  return `exports no \`${name}\``;
}

function defaultValue(program: Program): Expression | string {
  const found = findDefaultExport(program);
  if (found === null) return "exports no default";
  switch (found.kind) {
    case "expression":
      return found.expression.type === "Identifier"
        ? (topLevelConst(program, found.expression.name) ?? found.expression)
        : found.expression;
    case "binding":
      return (
        topLevelConst(program, found.name) ??
        `exports ${found.name}, which no top-level const declares`
      );
    case "several":
      return "exports more than one default";
    case "type":
      return "exports only a type as its default";
    case "other":
      return `exports ${found.what} as its default`;
  }
}

function other(what: string): ExportedObject {
  return { kind: "other", what };
}
