import { type AstNode, isNode, nameOf } from "./ast";

/** A name a file imports from a module, or exports from it again. */
export interface NamedImport {
  /** The declaration: an `import`, or an `export … from` another module. */
  readonly declaration: AstNode;
  readonly specifier: AstNode;
  readonly kind: "import" | "export";
  readonly module: string;
  /** The name the module exports. */
  readonly imported: string;
  /** The name the file gives it: its binding for an import, its own export's name for an export from the module. */
  readonly local: string;
  /** Whether it is imported as a type: `import type { … }`, or `type` before the name. */
  readonly typeOnly: boolean;
}

/* A specifier's name, as an identifier or as a string an export writes: export { "x" as y }. */
function specifierName(node: unknown): string | undefined {
  if (isNode(node) && node.type === "Literal" && typeof node.value === "string") return node.value;
  return nameOf(node);
}

/**
 * The module a declaration imports from or exports from.
 *
 * @param declaration - An import, or an export with a source
 * @returns The module's specifier, or `undefined` for a declaration with none
 * @example
 * ```ts
 * sourceOf(program.body[0]); // "@noverax/courier"
 * ```
 */
export function sourceOf(declaration: AstNode): string | undefined {
  const { source } = declaration;
  return isNode(source) && typeof source.value === "string" ? source.value : undefined;
}

/**
 * The names a file imports from the modules given, and exports from them
 * again, each with its declaration and specifier, in the file's order.
 *
 * @param program - The file's tree
 * @param modules - The modules
 * @returns The names
 * @example
 * ```ts
 * namedImports(program, new Set(["@noverax/courier"])).map((each) => each.imported); // ["AuthError", "createCaller"]
 * ```
 */
export function namedImports(program: AstNode, modules: ReadonlySet<string>): NamedImport[] {
  const body = Array.isArray(program.body) ? program.body.filter(isNode) : [];
  return body.flatMap((declaration) => {
    const module = sourceOf(declaration);
    if (module === undefined || !modules.has(module)) return [];
    const isImport = declaration.type === "ImportDeclaration";
    if (!isImport && declaration.type !== "ExportNamedDeclaration") return [];
    const declaredType = (isImport ? declaration.importKind : declaration.exportKind) === "type";
    const specifiers = Array.isArray(declaration.specifiers)
      ? declaration.specifiers.filter(isNode)
      : [];
    return specifiers.flatMap((specifier) => {
      const wanted = isImport
        ? specifier.type === "ImportSpecifier"
        : specifier.type === "ExportSpecifier";
      const imported = specifierName(isImport ? specifier.imported : specifier.local);
      const local = specifierName(isImport ? specifier.local : specifier.exported);
      if (!wanted || imported === undefined || local === undefined) return [];
      const typed = (isImport ? specifier.importKind : specifier.exportKind) === "type";
      const kind = isImport ? ("import" as const) : ("export" as const);
      return [
        { declaration, specifier, kind, module, imported, local, typeOnly: declaredType || typed },
      ];
    });
  });
}
