import { parseSource } from "@noverax/courier-cli/devkit";
import type { ImportDeclaration, ImportSpecifier } from "oxc-parser";
import type { ParsedImport } from "./types";

/**
 * The import statements of a generated file, each with the module it reads
 * and the names it binds, types apart. They are read from the file's syntax:
 * a statement wrapped over lines is one statement, one after a blank line is
 * still an import, and text in a comment never reads as one.
 *
 * @param lines - The file's lines
 * @returns One entry per import statement, in order; a default, mixed or
 *   side-effect import is kept as written
 * @example
 * ```ts
 * parseImports(['import { z } from "zod";']); // → [{ raw: 'import { z } from "zod";', source: "zod", names: ["z"], typeNames: [] }]
 * ```
 */
export function parseImports(lines: string[]): ParsedImport[] {
  const content = lines.join("\n");
  const statements = parseSource("imports.ts", content).program.body.filter(
    (statement): statement is ImportDeclaration => statement.type === "ImportDeclaration",
  );
  return importsOf(content, statements);
}

/**
 * Read import statements already parsed.
 *
 * @param content - The text the statements were parsed from
 * @param statements - The statements
 * @returns One entry per statement, in order, as {@link parseImports} reads them
 * @example
 * ```ts
 * importsOf(text, statements).map((entry) => entry.source); // ["zod", "./schemas"]
 * ```
 */
export function importsOf(
  content: string,
  statements: readonly ImportDeclaration[],
): ParsedImport[] {
  return statements.map((statement) => importOf(content, statement));
}

function importOf(content: string, statement: ImportDeclaration): ParsedImport {
  const raw = content.slice(statement.start, statement.end);
  const source = statement.source.value;
  const kept: ParsedImport = { raw, source, names: [], typeNames: [] };
  const [first] = statement.specifiers;
  /* A default, mixed or side-effect import is kept as written; so is a
     namespace read for its types alone, which a schemas merge reads itself. */
  if (first === undefined || statement.specifiers.some((s) => s.type === "ImportDefaultSpecifier"))
    return kept;
  if (first.type === "ImportNamespaceSpecifier") {
    return statement.importKind === "type" ? kept : { ...kept, namespaceImport: first.local.name };
  }
  const names: string[] = [];
  const typeNames: string[] = [];
  for (const specifier of statement.specifiers) {
    if (specifier.type !== "ImportSpecifier") continue;
    /* `import type { … }` makes every name a type. */
    const types = statement.importKind === "type" || specifier.importKind === "type";
    (types ? typeNames : names).push(specifierText(specifier));
  }
  return { ...kept, names, typeNames };
}

/* A specifier as an import list writes it: `a`, or `a as b` for a name bound under another. */
function specifierText(specifier: ImportSpecifier): string {
  const { imported, local } = specifier;
  const name = imported.type === "Literal" ? JSON.stringify(imported.value) : imported.name;
  return name === local.name ? name : `${name} as ${local.name}`;
}
