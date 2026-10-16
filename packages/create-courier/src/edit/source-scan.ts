/** Where the code of a JavaScript or TypeScript file is, and how its brackets pair. */
export interface SourceScan {
  readonly text: string;
  /** 1 for each character of code; 0 inside a string, a template's text, a comment or a regular expression. */
  readonly code: Uint8Array;
  /** 1 for each character of a string or of a template's text, its quotes among them; 0 elsewhere, comments included. */
  readonly literal: Uint8Array;
  /** The bracket that closes each opening `(`, `[` and `{`, by index. */
  readonly closer: ReadonlyMap<number, number>;
}

const OPENERS = new Set(["(", "[", "{"]);
const PAIRS: Readonly<Record<string, string>> = { ")": "(", "]": "[", "}": "{" };
/* After one of these, or a keyword such as `return`, a `/` starts a regular expression rather than dividing. */
const BEFORE_REGEX = new Set([..."(,=:[!&|?{};+-*%<>~^"]);

/* The end of a string that starts at `start`, past its closing quote. */
function stringEnd(text: string, start: number): number {
  const quote = text[start];
  let at = start + 1;
  while (at < text.length && text[at] !== quote && text[at] !== "\n")
    at += text[at] === "\\" ? 2 : 1;
  return at + 1;
}

/* The end of a regular expression that starts at `start`, past its flags. */
function regexEnd(text: string, start: number): number {
  let at = start + 1;
  let inClass = false;
  while (at < text.length && text[at] !== "\n") {
    const char = text[at];
    if (char === "\\") at++;
    else if (char === "[") inClass = true;
    else if (char === "]") inClass = false;
    else if (char === "/" && !inClass) break;
    at++;
  }
  at++;
  while (at < text.length && /[a-z]/i.test(text[at] ?? "")) at++;
  return at;
}

function startsRegex(text: string, code: Uint8Array, at: number): boolean {
  /* `</` closes a JSX element: no expression puts a regular expression right after a `<`. */
  if (text[at - 1] === "<" && code[at - 1] === 1) return false;
  let before = at - 1;
  while (before >= 0 && /\s/.test(text[before] ?? "")) before--;
  if (before < 0) return true;
  const char = text[before] ?? "";
  /* A string or a template just before is a value that is divided; a comment is not. */
  if (code[before] === 0) return char !== '"' && char !== "'" && char !== "`";
  if (BEFORE_REGEX.has(char)) return true;
  return /\b(?:return|typeof|case|in|of|delete|void|throw|new)$/.test(text.slice(0, before + 1));
}

/**
 * Read a JavaScript or TypeScript file far enough to change it safely: which
 * characters are code, and which bracket closes which. Strings, template
 * text, comments and regular expressions are told apart from code, so a
 * bracket or a word inside one is never taken for code. Read to be changed,
 * a file whose brackets do not pair is no scan; read for what it loads and
 * calls, its brackets are paired as far as they go.
 *
 * @param text - The file
 * @param lenient - Whether to read a file whose brackets do not pair
 * @returns The scan, or `undefined` when its brackets do not pair up and it is not read leniently
 * @example
 * ```ts
 * scanSource("export default defineConfig({ plugins: [react()] });")?.closer.get(27); // 52
 * ```
 */
export function scanSource(text: string, lenient = false): SourceScan | undefined {
  const code = new Uint8Array(text.length);
  const literal = new Uint8Array(text.length);
  const closer = new Map<number, number>();
  /* Open brackets, and -1 for a template whose `${` is open. */
  const stack: number[] = [];
  let at = 0;
  let inTemplate = false;
  while (at < text.length) {
    const char = text[at] ?? "";
    if (inTemplate) {
      literal.fill(1, at, at + (char === "\\" ? 2 : 1));
      if (char === "\\") at += 2;
      else if (char === "`") {
        inTemplate = false;
        at++;
      } else if (char === "$" && text[at + 1] === "{") {
        stack.push(-1);
        inTemplate = false;
        at += 2;
      } else at++;
      continue;
    }
    if (char === "/" && text[at + 1] === "/") {
      at = text.indexOf("\n", at);
      if (at === -1) at = text.length;
    } else if (char === "/" && text[at + 1] === "*") {
      const end = text.indexOf("*/", at + 2);
      if (end === -1 && !lenient) return undefined;
      at = end === -1 ? text.length : end + 2;
    } else if (char === '"' || char === "'") {
      const end = stringEnd(text, at);
      literal.fill(1, at, end);
      at = end;
    } else if (char === "`") {
      literal[at] = 1;
      inTemplate = true;
      at++;
    } else if (char === "/" && startsRegex(text, code, at)) at = regexEnd(text, at);
    else {
      code[at] = 1;
      if (OPENERS.has(char)) stack.push(at);
      else if (char in PAIRS) {
        const open = stack.pop();
        if (open === undefined) {
          if (!lenient) return undefined;
        } else if (open === -1) {
          /* Read leniently, a stray closer inside `${…}` leaves the template's brace open. */
          if (char === "}") {
            code[at] = 0;
            inTemplate = true;
          } else if (lenient) stack.push(-1);
          else return undefined;
        } else if (text[open] === PAIRS[char]) closer.set(open, at);
        else if (!lenient) return undefined;
      }
      at++;
    }
  }
  const paired = stack.length === 0 && !inTemplate;
  return paired || lenient ? { text, code, literal, closer } : undefined;
}

/**
 * Every place a pattern matches in code: its match starts on a character of
 * code, so a match inside a string or a comment does not count — nor does
 * it hide one in the code it runs on into, which is looked for from just
 * past where it began.
 *
 * @param scan - The scanned file
 * @param pattern - A global regular expression
 * @returns The matches
 * @example
 * ```ts
 * codeMatches(scan, /export\s+default\b/g).length; // 1
 * ```
 */
export function codeMatches(scan: SourceScan, pattern: RegExp): RegExpExecArray[] {
  const search = new RegExp(pattern.source, pattern.flags);
  const found: RegExpExecArray[] = [];
  for (let match = search.exec(scan.text); match !== null; match = search.exec(scan.text)) {
    if (scan.code[match.index] === 1) found.push(match);
    else search.lastIndex = match.index + 1;
    if (match[0] === "") search.lastIndex++;
  }
  return found;
}

/**
 * The next character of code at or after an index that is not white space.
 *
 * @param scan - The scanned file
 * @param from - Where to start
 * @returns Its index, or `-1` when there is none
 * @example
 * ```ts
 * nextCode(scan, 14); // the index of "(" in "export default (…"
 * ```
 */
export function nextCode(scan: SourceScan, from: number): number {
  for (let at = from; at < scan.text.length; at++) {
    if (scan.code[at] === 1 && !/\s/.test(scan.text[at] ?? "")) return at;
  }
  return -1;
}
