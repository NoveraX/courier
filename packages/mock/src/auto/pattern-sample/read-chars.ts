import type { Cursor, PatternNode } from "./types";

const DIGITS = "0123456789";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = LOWER.toUpperCase();
const WORD = `${LOWER}${UPPER}${DIGITS}_`;
const PRINTABLE = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("");

const CLASS_ESCAPES = new Map([
  ["d", DIGITS],
  ["w", WORD],
  ["s", " "],
  ["D", LOWER],
  ["W", "-"],
  ["S", LOWER],
]);
const CONTROL_ESCAPES = new Map([
  ["n", "\n"],
  ["r", "\r"],
  ["t", "\t"],
  ["f", "\f"],
  ["v", "\v"],
  ["0", "\0"],
]);
const PROPERTY_CHARS = new Map([
  ["L", LOWER],
  ["Letter", LOWER],
  ["Ll", LOWER],
  ["Lu", UPPER],
  ["N", DIGITS],
  ["Nd", DIGITS],
]);

const BACKREFERENCE = /^[1-9k]$/;
const HEX_ESCAPE = /^([0-9a-fA-F]{2})/;
const UNICODE_ESCAPE = /^(?:\{([0-9a-fA-F]+)\}|([0-9a-fA-F]{4}))/;
const PROPERTY_ESCAPE = /^\{([^}]*)\}/;

/**
 * Read the escape that follows a backslash outside a character class.
 *
 * @param c Cursor positioned just after the backslash; advanced past the escape
 * @returns The characters it can stand for, an empty text for `\b` and `\B`,
 *   or `undefined` for a backreference or another escape no value satisfies alone
 * @example
 * ```ts
 * readEscape({ source: "d{5}", pos: 0 }); // { kind: "set", chars: ["0", "1", …, "9"] }
 * ```
 */
export function readEscape(c: Cursor): PatternNode | undefined {
  const chars = readEscapedChars(c, false);
  if (chars === undefined) return undefined;
  const members = [...chars];
  return members.length > 1 ? { kind: "set", chars: members } : { kind: "text", text: chars };
}

/**
 * Read a character class, `[...]` or `[^...]`, after its opening bracket.
 *
 * @param c Cursor positioned just after `[`; advanced past the closing `]`
 * @returns The class as a set of printable characters, or `undefined` when
 *   it is unterminated, empty, or uses an escape that cannot be generated
 * @example
 * ```ts
 * readClass({ source: "a-c]", pos: 0 }); // { kind: "set", chars: ["a", "b", "c"] }
 * ```
 */
export function readClass(c: Cursor): PatternNode | undefined {
  const negated = c.source[c.pos] === "^";
  if (negated) c.pos++;
  let members = "";
  while (c.source[c.pos] !== "]") {
    if (c.pos >= c.source.length) return undefined;
    const start = readClassChars(c);
    if (start === undefined) return undefined;
    if (!startsRange(c, start)) {
      members += start;
      continue;
    }
    c.pos++;
    const end = readClassChars(c);
    if (end?.length !== 1) return undefined;
    members += expandRange(start, end);
  }
  c.pos++;
  const chars = negated ? [...PRINTABLE].filter((ch) => !members.includes(ch)) : [...members];
  return chars.length > 0 ? { kind: "set", chars } : undefined;
}

function readClassChars(c: Cursor): string | undefined {
  const char = c.source[c.pos] ?? "";
  c.pos++;
  return char === "\\" ? readEscapedChars(c, true) : char;
}

function startsRange(c: Cursor, start: string): boolean {
  const next = c.source[c.pos + 1];
  return start.length === 1 && c.source[c.pos] === "-" && next !== undefined && next !== "]";
}

/* Only the printable part of a range is used, so `\u0000-￿` yields
   characters a JSON body and a log line both show plainly. */
function expandRange(start: string, end: string): string {
  const from = Math.max(start.codePointAt(0) ?? 0, 32);
  const to = Math.min(end.codePointAt(0) ?? 0, 126);
  let chars = "";
  for (let code = from; code <= to; code++) chars += String.fromCharCode(code);
  return chars || start;
}

function readEscapedChars(c: Cursor, inClass: boolean): string | undefined {
  const char = c.source[c.pos] ?? "";
  c.pos++;
  const known = CLASS_ESCAPES.get(char) ?? CONTROL_ESCAPES.get(char);
  if (known !== undefined) return known;
  if (char === "b") return inClass ? "\b" : "";
  if (char === "B") return inClass ? undefined : "";
  if (char === "c" || BACKREFERENCE.test(char)) return undefined;
  if (char === "x") return readCodePoint(c, HEX_ESCAPE, char);
  if (char === "u") return readCodePoint(c, UNICODE_ESCAPE, char);
  if (char === "p" || char === "P") return readProperty(c, char === "P");
  return char;
}

function readCodePoint(c: Cursor, digits: RegExp, letter: string): string {
  const match = digits.exec(c.source.slice(c.pos));
  const hex = match?.[1] ?? match?.[2];
  if (!match || hex === undefined) return letter;
  c.pos += match[0].length;
  return String.fromCodePoint(Number.parseInt(hex, 16));
}

function readProperty(c: Cursor, negated: boolean): string | undefined {
  const match = PROPERTY_ESCAPE.exec(c.source.slice(c.pos));
  if (!match || negated) return undefined;
  c.pos += match[0].length;
  const name = match[1] ?? "";
  return PROPERTY_CHARS.get(name) ?? (name.endsWith("=Latin") ? LOWER : undefined);
}
