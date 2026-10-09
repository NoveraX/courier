import type { Literal } from "./literal";
import type { SourceScan } from "./source-scan";

/* The white space a line starts with. */
function indentAt(text: string, at: number): string {
  const lineStart = text.lastIndexOf("\n", at - 1) + 1;
  return /^[ \t]*/.exec(text.slice(lineStart))?.[0] ?? "";
}

/**
 * The step a file indents by: the white space its first indented line of
 * code starts with — a tab, or some spaces.
 *
 * @param text - The file
 * @returns The step; two spaces when no line is indented
 * @example
 * ```ts
 * indentUnit("export default {\n\tplugins: []\n}"); // "\t"
 * ```
 */
export function indentUnit(text: string): string {
  return /^([ \t]+)\S/m.exec(text)?.[1] ?? "  ";
}

/* The last character of code inside a literal that is neither white space nor a trailing comma. */
function lastItemEnd(scan: SourceScan, literal: Literal): number {
  for (let at = literal.close - 1; at > literal.open; at--) {
    const char = scan.text[at] ?? "";
    if (scan.code[at] === 1 && !/[\s,]/.test(char)) return at;
  }
  return -1;
}

/* The first character of code inside a literal, white space aside. */
function firstItemStart(scan: SourceScan, literal: Literal): number {
  for (let at = literal.open + 1; at < literal.close; at++) {
    if (scan.code[at] === 1 && !/\s/.test(scan.text[at] ?? "")) return at;
  }
  return -1;
}

function splice(text: string, at: number, insert: string): string {
  return `${text.slice(0, at)}${insert}${text.slice(at)}`;
}

/* An item into a literal that holds nothing yet but white space and comments: an array keeps it on one line, an object gives it its own. */
function intoEmpty(scan: SourceScan, literal: Literal, item: string): string {
  const { text } = scan;
  const inner = text.slice(literal.open + 1, literal.close);
  const outer = indentAt(text, literal.open);
  const step = `${outer}${indentUnit(text)}`;
  if (!inner.includes("\n")) {
    if (inner.trim() !== "") return splice(text, literal.close, `${item} `);
    if (text[literal.open] === "[")
      return `${text.slice(0, literal.open + 1)}${item}${text.slice(literal.close)}`;
    return `${text.slice(0, literal.open + 1)}\n${step}${item},\n${outer}${text.slice(literal.close)}`;
  }
  const lineStart = text.lastIndexOf("\n", literal.close - 1) + 1;
  if (text.slice(lineStart, literal.close).trim() !== "") {
    return splice(text, literal.close, `\n${step}${item},\n${outer}`);
  }
  return splice(text, lineStart, `${step}${item},\n`);
}

/**
 * Add an item at the end of an object or array literal, laid out as the
 * literal lays out the items it has: on their line, or on a line of its
 * own at their indentation. A trailing comma stays after the last item.
 *
 * @param scan - The scanned file
 * @param literal - The literal
 * @param item - The element, or the property as `key: value`
 * @returns The file with the item added
 * @example
 * ```ts
 * appendItem(scan, plugins, "courierStudio()"); // "[react()]" → "[react(), courierStudio()]"
 * ```
 */
export function appendItem(scan: SourceScan, literal: Literal, item: string): string {
  const { text } = scan;
  const last = lastItemEnd(scan, literal);
  if (last === -1) return intoEmpty(scan, literal, item);
  const first = firstItemStart(scan, literal);
  const ownLines = text.slice(literal.open, first).includes("\n");
  return splice(text, last + 1, ownLines ? `,\n${indentAt(text, first)}${item}` : `, ${item}`);
}

/**
 * Add a line after a file's last top-level `import` statement — after the
 * line its module is named on, for an import that spans lines — or at the
 * top of a file that imports nothing, below a leading comment line.
 *
 * @param scan - The scanned file
 * @param line - The import statement
 * @returns The file with the import added
 * @example
 * ```ts
 * addImportLine(scan, 'import { courierStudio } from "@noverax/courier-studio/vite";');
 * ```
 */
export function addImportLine(scan: SourceScan, line: string): string {
  const { text } = scan;
  const imports = [...text.matchAll(/^import\b/gm)].filter((match) => scan.code[match.index]);
  const last = imports.at(-1);
  if (last === undefined) {
    const header = /^(?:\/\/[^\n]*\n|#![^\n]*\n)*/.exec(text)?.[0] ?? "";
    const gap = text.startsWith("\n", header.length) ? "" : "\n";
    return splice(text, header.length, `${line}\n${gap}`);
  }
  const named = /\bfrom\s*["']|^import\s*["']/m;
  const rest = text.slice(last.index);
  const at = named.exec(rest);
  const lineEnd = text.indexOf("\n", last.index + (at ? at.index + at[0].length : 0));
  return splice(text, lineEnd === -1 ? text.length : lineEnd, `\n${line}`);
}
