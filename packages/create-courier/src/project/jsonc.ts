/**
 * Parse JSON as tsconfig files are written: with comments, and with a
 * comma after the last item.
 *
 * @param text - The file
 * @returns What it holds
 * @throws {SyntaxError} When it is not JSON once its comments and trailing commas go
 * @example
 * ```ts
 * parseJsonc('{ "include": ["src"], // the code\n }'); // { include: ["src"] }
 * ```
 */
export function parseJsonc(text: string): unknown {
  let out = "";
  for (let at = 0; at < text.length; at++) {
    const char = text[at] ?? "";
    if (char === '"') {
      const end = endOfString(text, at);
      out += text.slice(at, end);
      at = end - 1;
    } else if (char === "/" && text[at + 1] === "/") {
      while (at < text.length && text[at] !== "\n") at++;
      out += "\n";
    } else if (char === "/" && text[at + 1] === "*") {
      at = text.indexOf("*/", at + 2) + 1 || text.length;
    } else out += char;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

function endOfString(text: string, start: number): number {
  let at = start + 1;
  while (at < text.length && text[at] !== '"') at += text[at] === "\\" ? 2 : 1;
  return at + 1;
}
