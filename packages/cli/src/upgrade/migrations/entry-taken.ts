import { type AstNode, isNode } from "../codemod/ast";
import { referencesTo } from "../codemod/binding-references";
import { keyOf } from "../codemod/literals";
import { isTypeOnly } from "../entries/entry-names";
import type { TakenName } from "./entry-findings";

/** What a declaration with the root's source takes of it. */
export interface Taken {
  readonly statement: AstNode;
  /** The string that names the root: the declaration's source, or what `import()` or `require()` is called with. */
  readonly source: AstNode;
  /** For an `import()` or a `require()` of the root, which. */
  readonly call?: "import()" | "require()";
  /** The names it takes; `undefined` where they cannot be told: a namespace used whole, a default. */
  readonly names: readonly TakenName[] | undefined;
  /** `export *`: every name, re-exported. */
  readonly star: boolean;
  /** Whether it takes types alone: as a declaration of types, or every name one by one, as a type or by `type`. */
  readonly typesAlone: "declaration" | "names" | undefined;
}

/* Whether a declaration takes a value of the root's, or names it can't tell, rather than types alone, which the build erases. */
export function takesValues(taken: Taken): boolean {
  return taken.names === undefined || taken.names.some(({ type }) => !type);
}

/* The names a binding of the root is used by in the scope that declares it: each `ns.name`, of a value or a type; `undefined` where it is used whole. */
export function membersOf(program: AstNode, binding: AstNode): TakenName[] | undefined {
  const names = new Map<string, boolean>();
  for (const { ancestors, key } of referencesTo(program, binding)) {
    const parent = ancestors.at(-1);
    const member =
      parent?.type === "MemberExpression" && key === "object" && parent.computed !== true
        ? parent.property
        : parent?.type === "TSQualifiedName" && key === "left"
          ? parent.right
          : undefined;
    const name = isNode(member) && typeof member.name === "string" ? member.name : undefined;
    if (name === undefined) return undefined;
    names.set(name, parent?.type === "TSQualifiedName");
  }
  return [...names].map(([name, type]) => ({ name, type }));
}

/**
 * What a declaration takes of the root: its names, each as a type or
 * not — an import's name the root gives as a type alone is one, marked
 * or not, as TypeScript drops it; a re-export's only by `type` — and
 * whether it takes types alone. None for a declaration that only loads
 * the root, `import "@noverax/courier"`.
 *
 * @param statement - The declaration
 * @param program - Its piece's tree, for the members a namespace is used by in its scope
 * @returns What it takes
 * @example
 * ```ts
 * takenBy(statement, program)?.typesAlone; // "declaration" for `import type { CallOptions } from "@noverax/courier"`
 * ```
 */
export function takenBy(statement: AstNode, program: AstNode): Taken | undefined {
  const { source } = statement;
  if (!isNode(source)) return undefined;
  const typed = statement.importKind === "type" || statement.exportKind === "type";
  const typesAlone = typed ? "declaration" : undefined;
  if (statement.type === "ExportAllDeclaration")
    return { statement, source, names: undefined, star: true, typesAlone };
  const specifiers = Array.isArray(statement.specifiers) ? statement.specifiers.filter(isNode) : [];
  if (specifiers.length === 0) return undefined;
  const imported = statement.type === "ImportDeclaration";
  const names: TakenName[] = [];
  for (const specifier of specifiers) {
    if (specifier.type === "ImportNamespaceSpecifier" && isNode(specifier.local)) {
      const members = membersOf(program, specifier.local);
      if (members === undefined)
        return { statement, source, names: undefined, star: false, typesAlone };
      names.push(...members);
      continue;
    }
    const name = keyOf(specifier.type === "ExportSpecifier" ? specifier.local : specifier.imported);
    if (specifier.type === "ImportDefaultSpecifier" || name === undefined)
      return { statement, source, names: undefined, star: false, typesAlone };
    const own = specifier.importKind === "type" || specifier.exportKind === "type";
    names.push({ name, type: typed || own || (imported && isTypeOnly(name)) });
  }
  const alone = typesAlone ?? (names.every(({ type }) => type) ? "names" : undefined);
  return { statement, source, names, star: false, typesAlone: alone };
}
