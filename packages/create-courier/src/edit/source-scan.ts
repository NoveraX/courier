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
 * bracket or a word inside one is never taken for code.
 *
 * @param text - The file
 * @returns The scan, or `undefined` when its brackets do not pair up
 * @example
 * ```ts
 * scanSource("export default defineConfig({ plugins: [react()] });")?.closer.get(27); // 52
 * ```
 */
export function scanSource(text: string): SourceScan | undefined {
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
      if (end === -1) return undefined;
      at = end + 2;
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
        if (open === undefined) return undefined;
        if (open === -1) {
          if (char !== "}") return undefined;
          code[at] = 0;
          inTemplate = true;
        } else if (text[open] !== PAIRS[char]) return undefined;
        else closer.set(open, at);
      }
      at++;
    }
  }
  return stack.length === 0 && !inTemplate ? { text, code, literal, closer } : undefined;
}

/**
 * Every place a pattern matches in code: its match starts on a character of
 * code, so a match inside a string or a comment does not count.
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
  return [...scan.text.matchAll(pattern)].filter((match) => scan.code[match.index] === 1);
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
