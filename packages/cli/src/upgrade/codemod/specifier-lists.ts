import type { TextEdit } from "../migration";
import { type AstNode, isNode } from "./ast";
import type { ParsedFile, Pending } from "./codemod-types";
import { sourceOf } from "./imports";

/* A declaration's specifiers, and those of them that name names: not a default or a namespace. */
function specifiersOf(declaration: AstNode): { all: AstNode[]; named: AstNode[] } {
  const all = Array.isArray(declaration.specifiers) ? declaration.specifiers.filter(isNode) : [];
  const named = all.filter(
    (each) => each.type === "ImportSpecifier" || each.type === "ExportSpecifier",
  );
  return { all, named };
}

/**
 * The edits that take specifiers out of a declaration's list, each with
 * the comma beside it, the rest of the list left as written: a run of
 * them up to the next kept one, or after the last kept one.
 *
 * @param text - The file's text
 * @param declaration - The declaration
 * @param removed - The specifiers to take out
 * @returns The edits, or `"whole"` where nothing would be left of the declaration
 * @example
 * ```ts
 * removalEdits(text, declaration, new Set([specifier])); // [{ start: 9, end: 20, text: "" }]
 * ```
 */
export function removalEdits(
  text: string,
  declaration: AstNode,
  removed: ReadonlySet<AstNode>,
): TextEdit[] | "whole" {
  const { all, named } = specifiersOf(declaration);
  const kept = named.filter((each) => !removed.has(each));
  if (kept.length === 0 && all.length === named.length) return "whole";
  const first = named[0];
  const last = named.at(-1);
  if (kept.length === 0 && first !== undefined && last !== undefined) {
    /* `import Courier, { AuthError } from …` keeps its default: the comma and the braces go. */
    const open = text.lastIndexOf("{", first.start);
    return [{ start: text.lastIndexOf(",", open), end: text.indexOf("}", last.end) + 1, text: "" }];
  }
  const edits: TextEdit[] = [];
  for (let at = 0; at < named.length; at++) {
    const start = named[at];
    if (start === undefined || !removed.has(start)) continue;
    let end = at;
    while (end + 1 < named.length && removed.has(named[end + 1] as AstNode)) end++;
    const next = named[end + 1];
    const previous = named[at - 1];
    const stop = named[end] ?? start;
    if (next !== undefined) edits.push({ start: start.start, end: next.start, text: "" });
    else if (previous !== undefined) edits.push({ start: previous.end, end: stop.end, text: "" });
    at = end;
  }
  return edits;
}

/* The specifier's text: `type Name` where the declaration it goes in is not one of types alone. */
function written(name: Pending, typeDeclaration: boolean): string {
  return name.typeOnly && !typeDeclaration ? `type ${name.spec}` : name.spec;
}

/**
 * The edit that puts names in a declaration of their new module the file
 * has already — of the same kind, one of types alone only for types —
 * after its last name, on a line of its own where the list spans lines,
 * a trailing comma kept.
 *
 * @param file - The file
 * @param kind - An import, or an export from the module
 * @param module - The new module
 * @param names - The names
 * @param removed - Declarations taken out whole, which take nothing in
 * @returns The edit, or `undefined` where the file has no such declaration
 * @example
 * ```ts
 * addedToDeclaration(file, "import", "@noverax/courier/realtime", [{ spec: "AuthError", typeOnly: false }], new Set());
 * ```
 */
export function addedToDeclaration(
  file: ParsedFile,
  kind: "import" | "export",
  module: string,
  names: readonly Pending[],
  removed: ReadonlySet<AstNode>,
): TextEdit | undefined {
  const { text, program } = file;
  const body = Array.isArray(program.body) ? program.body.filter(isNode) : [];
  const types = names.every((name) => name.typeOnly);
  const target = body.find((each) => {
    const declared =
      each.type === (kind === "import" ? "ImportDeclaration" : "ExportNamedDeclaration");
    const typeDeclaration = each[kind === "import" ? "importKind" : "exportKind"] === "type";
    return (
      declared &&
      sourceOf(each) === module &&
      !removed.has(each) &&
      (types || !typeDeclaration) &&
      specifiersOf(each).named.length > 0
    );
  });
  const last = target === undefined ? undefined : specifiersOf(target).named.at(-1);
  if (target === undefined || last === undefined) return undefined;
  const typeDeclaration = target[kind === "import" ? "importKind" : "exportKind"] === "type";
  const specs = names.map((name) => written(name, typeDeclaration));
  const close = text.indexOf("}", last.end);
  const after = text.slice(last.end, close);
  if (!after.includes("\n") && !text.slice(target.start, last.start).includes("\n"))
    return { start: last.end, end: last.end, text: `, ${specs.join(", ")}` };
  const lineStart = text.lastIndexOf("\n", last.start) + 1;
  const indent = /^[ \t]*/.exec(text.slice(lineStart))?.[0] ?? "  ";
  const comma = after.indexOf(",");
  if (comma === -1)
    return {
      start: last.end,
      end: last.end,
      text: specs.map((spec) => `,\n${indent}${spec}`).join(""),
    };
  const at = last.end + comma + 1;
  return { start: at, end: at, text: specs.map((spec) => `\n${indent}${spec},`).join("") };
}

/**
 * A new declaration of names' new module, written as the declaration they
 * leave writes its module: its quotes, and its semicolon or none.
 *
 * @param file - The file
 * @param group - The names, the declaration they leave, its kind and the new module
 * @returns The declaration's text
 * @example
 * ```ts
 * declarationText(file, { anchor, kind: "import", to: "@noverax/courier/realtime", names }); // 'import { AuthError } from "@noverax/courier/realtime";'
 * ```
 */
export function declarationText(
  file: ParsedFile,
  group: {
    readonly anchor: AstNode;
    readonly kind: "import" | "export";
    readonly to: string;
    readonly names: readonly Pending[];
  },
): string {
  const { anchor, kind, to, names } = group;
  const raw =
    isNode(anchor.source) && typeof anchor.source.raw === "string" ? anchor.source.raw : '"';
  const quote = raw.startsWith("'") ? "'" : '"';
  const semicolon = file.text[anchor.end - 1] === ";" ? ";" : "";
  const types = names.every((name) => name.typeOnly);
  const specs = names.map((name) => written(name, types)).join(", ");
  return `${kind} ${types ? "type " : ""}{ ${specs} } from ${quote}${to}${quote}${semicolon}`;
}
