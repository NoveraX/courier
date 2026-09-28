import type { ImportDeclaration, Statement } from "oxc-parser";
import { exportName } from "../mocks-edit/plan/export-name";
import { patternNames } from "./pattern-names";

/** What one top-level name of a mocks file is bound to. */
export type TopLevelBinding =
  | {
      kind: "import";
      /** The module it comes from, as written */
      specifier: string;
      /** The import, as one binding: its kind, its imported name, its local name */
      form: string;
    }
  | { kind: "local"; statement: Statement };

/** A mocks file's top level, split into what binds names and what does not. */
export interface TopLevel {
  bindings: ReadonlyMap<string, TopLevelBinding>;
  /** Statements that bind no name, such as a side-effect import or a call. */
  others: readonly Statement[];
}

/**
 * Sort a module's top-level statements into the names they bind and the
 * statements that bind none. A name bound twice keeps its first binding.
 *
 * @param body - The module's top-level statements
 * @returns Its bindings by name, and its other statements in order
 * @example
 * ```ts
 * topLevelBindings(parsed.program.body).bindings.get("api"); // → { kind: "import", specifier: "./api", … }
 * ```
 */
export function topLevelBindings(body: readonly Statement[]): TopLevel {
  const bindings = new Map<string, TopLevelBinding>();
  const others: Statement[] = [];
  const bind = (name: string, binding: TopLevelBinding) => {
    if (!bindings.has(name)) bindings.set(name, binding);
  };
  for (const statement of body) {
    if (statement.type === "ImportDeclaration" && statement.specifiers.length > 0) {
      for (const [name, binding] of importBindings(statement)) bind(name, binding);
      continue;
    }
    const names = declaredNames(statement);
    if (names.length === 0) others.push(statement);
    for (const name of names) bind(name, { kind: "local", statement });
  }
  return { bindings, others };
}

function importBindings(statement: ImportDeclaration): Array<[string, TopLevelBinding]> {
  const specifier = statement.source.value;
  return statement.specifiers.map((entry) => {
    const imported =
      entry.type === "ImportSpecifier"
        ? exportName(entry.imported)
        : entry.type === "ImportDefaultSpecifier"
          ? "default"
          : "*";
    const typeOnly =
      statement.importKind === "type" ||
      (entry.type === "ImportSpecifier" && entry.importKind === "type");
    const form = `${typeOnly ? "type " : ""}${imported} as ${entry.local.name}`;
    return [entry.local.name, { kind: "import", specifier, form }];
  });
}

/* Declarations name what they bind; an export wraps the same declarations. */
function declaredNames(statement: Statement): string[] {
  const declaration =
    statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
  if (declaration === null) return [];
  switch (declaration.type) {
    case "VariableDeclaration":
      return declaration.declarations.flatMap((declarator) => patternNames(declarator.id));
    case "FunctionDeclaration":
    case "ClassDeclaration":
    case "TSTypeAliasDeclaration":
    case "TSInterfaceDeclaration":
    case "TSEnumDeclaration":
      return declaration.id ? [declaration.id.name] : [];
    default:
      return [];
  }
}
