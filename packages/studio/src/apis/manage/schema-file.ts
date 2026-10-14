import { parseSource } from "@noverax/courier-cli/devkit";
import type { Declaration, Statement } from "oxc-parser";
import { lineStart } from "../../server/mocks-edit/plan/line-start";
import { referencedNames } from "./referenced-names";

/** One top-level statement of a schemas or types file. */
export interface SchemaStatement {
  /** An import, an exported declaration, or anything else, such as ArkType's cycle helper. */
  kind: "import" | "declaration" | "helper";
  /** The names it binds: exported ones for a declaration, local ones for an import or a helper. */
  binds: string[];
  /** Where it starts, its leading comments included, at the start of their line. */
  start: number;
  /** Where it ends: after the line terminator that ends its last line, if any. */
  end: number;
  /** Every name it refers to, its own included. */
  references: Set<string>;
}

/**
 * Read a generated schemas or types file as code: its statements, what each
 * binds and refers to, and where each lies with its comments. A bracket or
 * a quote inside a comment or a string cannot throw the reading off.
 *
 * @param path - The file, to name the language by
 * @param text - Its text, without Studio's header
 * @returns The statements in order, or `null` when the file does not parse
 * @example
 * ```ts
 * readSchemaFile("schemas.ts", 'export type Pet = { name: string };\n')?.[0]?.binds; // ["Pet"]
 * ```
 */
export function readSchemaFile(path: string, text: string): SchemaStatement[] | null {
  const parsed = parseSource(path, text);
  if (parsed.problem !== null) return null;
  let previousEnd = 0;
  return parsed.program.body.map((statement) => {
    const leading = parsed.comments.find((c) => c.start >= previousEnd && c.end <= statement.start);
    const start = lineStart(text, leading?.start ?? statement.start);
    previousEnd = statement.end;
    const eol = text.indexOf("\n", statement.end);
    return {
      kind: kindOf(statement),
      binds: bindingsOf(statement),
      start,
      end: eol === -1 ? text.length : eol + 1,
      references: referencedNames(statement),
    };
  });
}

function kindOf(statement: Statement | { type: string }): SchemaStatement["kind"] {
  if (statement.type === "ImportDeclaration") return "import";
  return statement.type === "ExportNamedDeclaration" ? "declaration" : "helper";
}

function bindingsOf(statement: Statement | { type: string }): string[] {
  if (statement.type === "ImportDeclaration" && "specifiers" in statement)
    return (statement.specifiers ?? []).map((specifier) => specifier.local.name);
  if (statement.type === "ExportNamedDeclaration" && "declaration" in statement) {
    const { declaration } = statement;
    return declaration === null ? [] : declaredNames(declaration);
  }
  return isDeclaration(statement) ? declaredNames(statement) : [];
}

function isDeclaration(statement: { type: string }): statement is Declaration {
  return [
    "VariableDeclaration",
    "FunctionDeclaration",
    "ClassDeclaration",
    "TSTypeAliasDeclaration",
    "TSInterfaceDeclaration",
    "TSEnumDeclaration",
  ].includes(statement.type);
}

function declaredNames(declaration: Declaration): string[] {
  switch (declaration.type) {
    case "VariableDeclaration":
      return declaration.declarations.flatMap((d) =>
        d.id.type === "Identifier" ? [d.id.name] : [],
      );
    case "FunctionDeclaration":
    case "ClassDeclaration":
      return declaration.id === null ? [] : [declaration.id.name];
    case "TSTypeAliasDeclaration":
    case "TSInterfaceDeclaration":
    case "TSEnumDeclaration":
      return [declaration.id.name];
    default:
      return [];
  }
}
