import type { AuditScope } from "./audit-scope";
import type { SplitStatements } from "./audit-statements";
import { findConfigLocals } from "./find-config-locals";
import { collectModuleBindings } from "./module-bindings";

/**
 * Hold the names an edit imports to the plan. oxc does not report a name
 * declared twice, so the audit checks it: every name the edit imports was
 * free in the file, and none twice; and the name the entries read the
 * config under is bound to the config's default export.
 *
 * @param scope - Both texts of the edit
 * @param split - The edited file's statements, told apart
 * @returns What is wrong, or `null`
 *
 * @example
 * ```ts
 * auditBindings(scope, split); // → "the edit imports courierConfig, which the file already declares"
 * ```
 */
export function auditBindings(scope: AuditScope, split: SplitStatements): string | null {
  const bound = collectModuleBindings(scope.old.program);
  const imported = [
    ...split.added.flatMap((statement) =>
      statement.type === "ImportDeclaration" ? statement.specifiers.map((s) => s.local.name) : [],
    ),
    ...(scope.plan.extendedImport?.names ?? []),
  ];
  const clash = imported.find((name, index) => bound.has(name) || imported.indexOf(name) !== index);
  if (clash !== undefined) return `the edit imports ${clash}, which the file already declares`;
  const { configLocal, configSpecifiers } = scope.plan;
  const locals = findConfigLocals(scope.next.program, configSpecifiers);
  if (locals.some((local) => local.name === configLocal)) return null;
  return `${configLocal} is not the config's default export in the edited file`;
}
