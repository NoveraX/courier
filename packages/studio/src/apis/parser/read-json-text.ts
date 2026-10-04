/* Steps over a comment that starts at `index`, or returns `index` itself. */
function pastComment(text: string, index: number): number {
  if (text[index] !== "/") return index;
  if (text[index + 1] === "/") {
    const end = text.indexOf("\n", index);
    return end === -1 ? text.length : end;
  }
  if (text[index + 1] === "*") {
    const end = text.indexOf("*/", index + 2);
    return end === -1 ? text.length : end + 2;
  }
  return index;
}

/* Whether what follows `index`, past blanks and comments, closes a list or an object. */
function closesNext(text: string, index: number): boolean {
  let at = index;
  for (;;) {
    while (at < text.length && /\s/.test(text.charAt(at))) at++;
    const past = pastComment(text, at);
    if (past === at) break;
    at = past;
  }
  return text[at] === "}" || text[at] === "]";
}

function withoutComments(text: string): string {
  let out = "";
  let inString = false;
  for (let index = 0; index < text.length; index++) {
    const char = text.charAt(index);
    if (inString) {
      out += char;
      if (char === "\\") out += text.charAt(++index);
      else if (char === '"') inString = false;
      continue;
    }
    const past = pastComment(text, index);
    if (past !== index) {
      index = past - 1;
      continue;
    }
    if (char === '"') inString = true;
    if (char === "," && closesNext(text, index + 1)) continue;
    out += char;
  }
  return out;
}

/**
 * Read a raw body as Postman sends it: JSON, which may carry comments and
 * trailing commas that Postman strips before it sends the body.
 *
 * @param text - The raw body
 * @returns The value it holds, or `undefined` when it is not JSON
 * @example
 * ```ts
 * readJsonText('{ "a": 1, // one\n }'); // → { value: { a: 1 } }
 * ```
 */
export function readJsonText(text: string): { value: unknown } | undefined {
  try {
    const value: unknown = JSON.parse(withoutComments(text));
    return { value };
  } catch {
    /* A raw body that is not JSON describes no shape worth generating. */
    return undefined;
  }
}
