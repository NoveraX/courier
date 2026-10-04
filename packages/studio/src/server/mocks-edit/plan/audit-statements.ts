import type { ImportDeclaration } from "oxc-parser";
import type { AuditScope } from "./audit-scope";
import type { ParsedSource } from "./parse-source";
import { previewText } from "./preview-text";
import type { SplitStatements, TopLevel } from "./split-statements";
import { textOf } from "./text-of";

/**
 * Hold the edited file's statements to the plan. Its own statements are the
 * old ones, in order and unchanged, except two: the one holding the mocks
 * object may change inside the object only, and an import the plan extends
 * may gain exactly the planned names. What it adds is imports, then — in a
 * file that had no default export — that export.
 *
 * @param scope - Both texts of the edit
 * @param split - The edited file's statements, told apart
 * @returns What is wrong, or `null`
 *
 * @example
 * ```ts
 * auditStatements(scope, split); // → "the statement const seed = 20; changed"
 * ```
 */
export function auditStatements(scope: AuditScope, split: SplitStatements): string | null {
  const own = scope.old.program.body;
  if (split.kept.length !== own.length) {
    return `the edited file has ${split.kept.length} statements of its own where it had ${own.length}`;
  }
  const added = auditAddedKinds(scope, split.added);
  if (added !== null) return added;
  for (const [index, statement] of own.entries()) {
    const counterpart = split.kept[index];
    const problem =
      counterpart === undefined
        ? "a statement is missing"
        : compare(scope, index, statement, counterpart);
    if (problem !== null) return problem;
  }
  return null;
}

function auditAddedKinds(scope: AuditScope, added: readonly TopLevel[]): string | null {
  for (const [index, statement] of added.entries()) {
    if (statement.type === "ImportDeclaration") continue;
    const appends = scope.before.kind === "absent" && index === added.length - 1;
    if (!appends || statement.type !== "ExportDefaultDeclaration") {
      return `the edit adds a ${statement.type} that is neither an import nor the mocks' default export`;
    }
  }
  return null;
}

function compare(
  scope: AuditScope,
  index: number,
  statement: TopLevel,
  counterpart: TopLevel,
): string | null {
  const { before, plan } = scope;
  if (before.kind === "object" && before.statement === index)
    return compareHolder(scope, statement, counterpart);
  if (plan.extendedImport !== null && plan.extendedImport.start === statement.start) {
    return compareExtended(scope, statement, counterpart, plan.extendedImport.names);
  }
  if (textOf(scope.old, statement) === textOf(scope.next, counterpart)) return null;
  return `the statement ${previewText(textOf(scope.old, statement))} changed`;
}

function compareHolder(
  scope: AuditScope,
  statement: TopLevel,
  counterpart: TopLevel,
): string | null {
  const { old, next, before, after } = scope;
  if (before.kind !== "object") return null;
  if (after.kind !== "object" || next.program.body[after.statement] !== counterpart) {
    return "the mocks object is no longer in the statement that held it";
  }
  const head =
    old.text.slice(statement.start, before.object.start) ===
    next.text.slice(counterpart.start, after.object.start);
  const tail =
    old.text.slice(before.object.end, statement.end) ===
    next.text.slice(after.object.end, counterpart.end);
  return head && tail ? null : "the statement holding the mocks object changed outside the object";
}

function compareExtended(
  scope: AuditScope,
  statement: TopLevel,
  counterpart: TopLevel,
  names: readonly string[],
): string | null {
  if (statement.type !== "ImportDeclaration" || counterpart.type !== "ImportDeclaration") {
    return "the import the plan extends is not an import";
  }
  const expected = [...statement.specifiers.map((s) => textOf(scope.old, s)), ...names];
  const actual = counterpart.specifiers.map((s) => textOf(scope.next, s));
  const same =
    sameSource(scope, statement, counterpart) && actual.join("\n") === expected.join("\n");
  return same
    ? null
    : `the import of ${statement.source.value} did not gain exactly ${names.join(", ")}`;
}

function sameSource(scope: AuditScope, a: ImportDeclaration, b: ImportDeclaration): boolean {
  const head = (parsed: ParsedSource, d: ImportDeclaration): string =>
    parsed.text.slice(d.start, d.specifiers[0]?.start ?? d.start);
  return (
    a.importKind === b.importKind &&
    textOf(scope.old, a.source) === textOf(scope.next, b.source) &&
    head(scope.old, a) === head(scope.next, b)
  );
}
