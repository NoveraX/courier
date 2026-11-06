import type { TextEdit } from "../migration";
import { type AstNode, isNode, nameOf, type Visited, walk } from "./ast";
import type { ParsedFile } from "./codemod-types";
import { occurrencesOf } from "./identifier-roles";
import { type NamedImport, namedImports } from "./imports";
import { removalEdits } from "./specifier-lists";

/**
 * The name a file gives a module's export it imports as a value.
 *
 * @param program - The file's tree
 * @param modules - The modules that export it
 * @param name - The export's name
 * @returns The import, or `undefined` where the file has none such
 * @example
 * ```ts
 * valueImport(program, new Set(["@noverax/courier"]), "isHTTPError")?.local; // "isHTTPError"
 * ```
 */
export function valueImport(
  program: AstNode,
  modules: ReadonlySet<string>,
  name: string,
): NamedImport | undefined {
  return namedImports(program, modules).find(
    (each) => each.kind === "import" && each.imported === name && !each.typeOnly,
  );
}

/**
 * Whether a file binds an import's name nowhere else — so every
 * reference of the name is to the import, for certain.
 *
 * @param program - The file's tree
 * @param named - The import
 * @returns Whether the import is the name's one binding
 */
export function boundOnce(program: AstNode, named: NamedImport): boolean {
  return occurrencesOf(program, named.local).filter((each) => each.role === "binding").length === 1;
}

/**
 * The name a file gives a module's export, where it imports it as a value
 * and binds that name nowhere else — so every call of the name is a call
 * of the export, for certain.
 *
 * @param program - The file's tree
 * @param modules - The modules that export it
 * @param name - The export's name
 * @returns The import, or `undefined` where the file has none such
 * @example
 * ```ts
 * boundImport(program, new Set(["@noverax/courier"]), "isHTTPError")?.local; // "isHTTPError"
 * ```
 */
export function boundImport(
  program: AstNode,
  modules: ReadonlySet<string>,
  name: string,
): NamedImport | undefined {
  const named = valueImport(program, modules, name);
  return named !== undefined && boundOnce(program, named) ? named : undefined;
}

/**
 * Each call of a name: the calls whose callee is the name itself.
 *
 * @param program - The file's tree
 * @param local - The name
 * @returns Each call, with the nodes above it
 */
export function callsOf(program: AstNode, local: string): Visited[] {
  const calls: Visited[] = [];
  walk(program, (visited) => {
    if (visited.node.type === "CallExpression" && nameOf(visited.node.callee) === local)
      calls.push({ ...visited, ancestors: [...visited.ancestors] });
  });
  return calls;
}

/**
 * The text a node is written with.
 *
 * @param file - The file
 * @param node - The node
 * @returns Its text
 */
export function textOf(file: ParsedFile, node: unknown): string {
  return isNode(node) ? file.text.slice(node.start, node.end) : "";
}

/**
 * Whether code at a place may `await`: inside an async function, the
 * nearest function above it.
 *
 * @param ancestors - The nodes above the place
 * @returns Whether it may
 */
export function inAsyncFunction(ancestors: readonly AstNode[]): boolean {
  const nearest = [...ancestors]
    .reverse()
    .find((each) =>
      /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(each.type),
    );
  return nearest?.async === true;
}

/**
 * The edits that drop a name's import from its declaration — the
 * declaration and its line, where nothing would be left of it.
 *
 * @param file - The file
 * @param named - The import
 * @returns The edits
 */
export function droppedImport(file: ParsedFile, named: NamedImport): TextEdit[] {
  const removal = removalEdits(file.text, named.declaration, new Set([named.specifier]));
  if (removal !== "whole") return removal;
  const { start, end } = named.declaration;
  const newline = file.text.startsWith("\r\n", end) ? 2 : file.text.startsWith("\n", end) ? 1 : 0;
  return [{ start, end: end + newline, text: "" }];
}
