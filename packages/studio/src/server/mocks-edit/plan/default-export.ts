import type {
  Directive,
  ExportNamedDeclaration,
  ExportSpecifier,
  Expression,
  Program,
  Statement,
} from "oxc-parser";
import { exportName } from "./export-name";

/** What a module exports as its default. */
export type DefaultExport =
  /** `export default <expression>`, in the statement at `statement`. */
  | { kind: "expression"; expression: Expression; statement: number }
  /** `export { name as default }`, naming a binding of the module. */
  | { kind: "binding"; name: string }
  /** Anything no object literal can be found in: `what` says what it is. */
  | { kind: "other"; what: string }
  /** More than one at runtime: the loader serves the last, while TypeScript rejects the file. */
  | { kind: "several" }
  /**
   * Only a type: `export default interface`, `export type { X as default }`,
   * `export { type X as default }` or `export type * as default`. It is gone
   * once the file is compiled, yet TypeScript allows no second default
   * export beside it.
   */
  | { kind: "type" };

const TYPE_ONLY: DefaultExport = { kind: "type" };

/**
 * Find a module's default export without judging it. A type-only one is
 * gone once the file is compiled, so it is reported only when the module
 * exports nothing else as its default: the runtime one wins when there is
 * one, and several runtime ones are `several`.
 *
 * @param program - The parsed module
 * @returns The default export, `several` when there is more than one at
 *   runtime, `type` when the only ones are type-only, or `null` when the
 *   module has none
 *
 * @example
 * ```ts
 * // export default interface Mocks {}
 * findDefaultExport(program); // → { kind: "type" }
 * ```
 */
export function findDefaultExport(program: Program): DefaultExport | null {
  const found = program.body.flatMap((statement, index) => defaultsIn(statement, index));
  const runtime = found.filter((candidate) => candidate.kind !== "type");
  if (runtime.length > 1) return { kind: "several" };
  return runtime[0] ?? found[0] ?? null;
}

function defaultsIn(statement: Directive | Statement, index: number): DefaultExport[] {
  switch (statement.type) {
    case "ExportDefaultDeclaration": {
      const { declaration } = statement;
      if (declaration.type === "TSInterfaceDeclaration") return [TYPE_ONLY];
      if (isExpression(declaration))
        return [{ kind: "expression", expression: declaration, statement: index }];
      return [{ kind: "other", what: "a function or class" }];
    }
    case "ExportAllDeclaration": {
      const named = statement.exported !== null && exportName(statement.exported) === "default";
      if (!named) return [];
      if (statement.exportKind === "type") return [TYPE_ONLY];
      return [{ kind: "other", what: `a namespace re-exported from "${statement.source.value}"` }];
    }
    case "ExportNamedDeclaration":
      return namedDefaults(statement);
    default:
      return [];
  }
}

function namedDefaults(statement: ExportNamedDeclaration): DefaultExport[] {
  return statement.specifiers
    .filter((specifier) => exportName(specifier.exported) === "default")
    .map((specifier) => {
      const typeOnly = statement.exportKind === "type" || specifier.exportKind === "type";
      return typeOnly ? TYPE_ONLY : namedDefault(statement, specifier);
    });
}

function namedDefault(
  statement: ExportNamedDeclaration,
  specifier: ExportSpecifier,
): DefaultExport {
  if (statement.source !== null) {
    return { kind: "other", what: `a value re-exported from "${statement.source.value}"` };
  }
  const { local } = specifier;
  if (local.type !== "Identifier") return { kind: "other", what: `"${exportName(local)}"` };
  return { kind: "binding", name: local.name };
}

function isExpression(declaration: { type: string }): declaration is Expression {
  return (
    declaration.type !== "FunctionDeclaration" &&
    declaration.type !== "ClassDeclaration" &&
    declaration.type !== "TSDeclareFunction"
  );
}
