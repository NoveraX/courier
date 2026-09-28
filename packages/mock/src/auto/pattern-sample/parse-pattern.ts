import { readClass, readEscape } from "./read-chars";
import type { Cursor, PatternNode } from "./types";

const EMPTY: PatternNode = { kind: "text", text: "" };
const ANY_CHAR = [..."abcdefghijklmnopqrstuvwxyz0123456789"];
const LOOKAROUND = /^\?<?[=!]/;
const BRACES = /^\{(\d+)(,(\d*))?\}/;

/**
 * Parse a regular expression's source into a tree a generator can walk.
 * Anchors, word boundaries and lookarounds generate nothing; the caller
 * tests the result against the real pattern, so they are still enforced.
 *
 * @param source The `source` of a RegExp
 * @returns The parsed alternation, or `undefined` when the pattern uses a
 *   construct no value can be generated from, such as a backreference
 * @example
 * ```ts
 * parsePattern("^\\d{5}$"); // { kind: "alt", branches: [[…, { kind: "repeat", … }, …]] }
 * ```
 */
export function parsePattern(source: string): PatternNode | undefined {
  const cursor: Cursor = { source, pos: 0 };
  const root = parseAlternation(cursor);
  return root && cursor.pos === source.length ? root : undefined;
}

function parseAlternation(c: Cursor): PatternNode | undefined {
  const branches: PatternNode[][] = [];
  for (;;) {
    const sequence = parseSequence(c);
    if (!sequence) return undefined;
    branches.push(sequence);
    if (c.source[c.pos] !== "|") return { kind: "alt", branches };
    c.pos++;
  }
}

function parseSequence(c: Cursor): PatternNode[] | undefined {
  const nodes: PatternNode[] = [];
  while (c.pos < c.source.length && c.source[c.pos] !== "|" && c.source[c.pos] !== ")") {
    const atom = parseAtom(c);
    if (!atom) return undefined;
    const quantified = parseQuantifier(c, atom);
    if (!quantified) return undefined;
    nodes.push(quantified);
  }
  return nodes;
}

function parseAtom(c: Cursor): PatternNode | undefined {
  const char = c.source[c.pos] ?? "";
  c.pos++;
  if (char === "^" || char === "$") return EMPTY;
  if (char === ".") return { kind: "set", chars: ANY_CHAR };
  if (char === "(") return parseGroup(c);
  if (char === "[") return readClass(c);
  if (char === "\\") return readEscape(c);
  if ("*+?{".includes(char)) return undefined;
  return { kind: "text", text: char };
}

function parseGroup(c: Cursor): PatternNode | undefined {
  const lookaround = LOOKAROUND.exec(c.source.slice(c.pos));
  if (lookaround) c.pos += lookaround[0].length;
  else if (c.source.startsWith("?:", c.pos)) c.pos += 2;
  else if (c.source.startsWith("?<", c.pos)) {
    const close = c.source.indexOf(">", c.pos);
    if (close === -1) return undefined;
    c.pos = close + 1;
  }

  const inner = parseAlternation(c);
  if (!inner || c.source[c.pos] !== ")") return undefined;
  c.pos++;
  return lookaround ? EMPTY : inner;
}

function parseQuantifier(c: Cursor, node: PatternNode): PatternNode | undefined {
  const bounds = readQuantifier(c);
  if (!bounds) return node;
  if (c.source[c.pos] === "?") c.pos++;
  const [min, max] = bounds;
  return max < min ? undefined : { kind: "repeat", node, min, max };
}

function readQuantifier(c: Cursor): [number, number] | undefined {
  const char = c.source[c.pos];
  if (char === "*" || char === "+" || char === "?") {
    c.pos++;
    if (char === "?") return [0, 1];
    return [char === "+" ? 1 : 0, Number.POSITIVE_INFINITY];
  }
  const braces = BRACES.exec(c.source.slice(c.pos));
  if (!braces) return undefined;
  c.pos += braces[0].length;
  const min = Number(braces[1]);
  if (braces[2] === undefined) return [min, min];
  return [min, braces[3] ? Number(braces[3]) : Number.POSITIVE_INFINITY];
}
