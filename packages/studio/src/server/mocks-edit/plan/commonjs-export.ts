import type { AssignmentTarget, Expression, Program } from "oxc-parser";

/** A top-level statement that exports the CommonJS way. */
export interface CommonJsExport {
  start: number;
  /** How it exports, for the message: `module.exports`, `exports.x` or `export =`. */
  form: string;
}

/**
 * Find a top-level CommonJS export: `export =`, or an assignment to
 * `module.exports` or to a property of `exports` or `module.exports`.
 *
 * @param program - The parsed module
 * @returns The first such statement, or `null` when there is none
 *
 * @example
 * ```ts
 * findCommonJsExport(parseSource("x.ts", "module.exports = {};").program); // → { start: 0, form: "module.exports" }
 * ```
 */
export function findCommonJsExport(program: Program): CommonJsExport | null {
  for (const statement of program.body) {
    if (statement.type === "TSExportAssignment")
      return { start: statement.start, form: "export =" };
    if (statement.type !== "ExpressionStatement") continue;
    const { expression } = statement;
    if (expression.type !== "AssignmentExpression") continue;
    const form = exportsForm(expression.left);
    if (form !== null) return { start: statement.start, form };
  }
  return null;
}

function exportsForm(target: AssignmentTarget | Expression): string | null {
  if (target.type !== "MemberExpression") return null;
  const { object } = target;
  if (object.type !== "Identifier") return exportsForm(object);
  if (object.name === "exports") return "exports";
  return object.name === "module" && memberName(target) === "exports" ? "module.exports" : null;
}

function memberName(target: AssignmentTarget | Expression): string | null {
  if (target.type !== "MemberExpression") return null;
  const { property } = target;
  if (!target.computed) return property.type === "Identifier" ? property.name : null;
  return property.type === "Literal" && typeof property.value === "string" ? property.value : null;
}
