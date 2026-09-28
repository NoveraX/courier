import { pseudoRandom } from "../gen-helpers";
import { parsePattern } from "./parse-pattern";
import type { PatternNode } from "./types";

const ATTEMPTS = 8;
/* An open-ended quantifier (`*`, `+`, `{2,}`) repeats at most this many
   times past its minimum, keeping generated values short. */
const MAX_EXTRA_REPEATS = 3;

const parsed = new Map<string, PatternNode | undefined>();

/**
 * Generate a string that matches a regular expression, deterministically for
 * a given seed. Each candidate is tested against the pattern itself, so a
 * construct the generator only approximates (a lookahead, a flag) can never
 * let a non-matching value through.
 *
 * @param pattern A pattern without the `g` or `y` flag
 * @param seed    Record index; different seeds give different values
 * @returns A matching string, or `undefined` when none could be generated
 * @example
 * ```ts
 * samplePattern(/^[a-z]+(?:-[a-z]+)*$/, 3); // "fmgu-fi-u-ea"
 * samplePattern(/^\d{5}$/, 1);             // "82243"
 * ```
 */
export function samplePattern(pattern: RegExp, seed: number): string | undefined {
  const root = parsedPattern(pattern.source);
  if (!root) return undefined;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const value = emit(root, randomSource(seed * ATTEMPTS + attempt));
    if (pattern.test(value)) return value;
  }
  return undefined;
}

function parsedPattern(source: string): PatternNode | undefined {
  if (!parsed.has(source)) parsed.set(source, parsePattern(source));
  return parsed.get(source);
}

/** Returns a function picking an integer in `[0, n)` from a seeded sequence */
function randomSource(seed: number): (n: number) => number {
  let step = 0;
  return (n) => Math.floor(pseudoRandom(seed * 7919 + step++) * n);
}

function emit(node: PatternNode, next: (n: number) => number): string {
  switch (node.kind) {
    case "text":
      return node.text;
    case "set":
      return node.chars[next(node.chars.length)] ?? "";
    case "alt": {
      const branch = node.branches[next(node.branches.length)] ?? [];
      return branch.map((child) => emit(child, next)).join("");
    }
    case "repeat": {
      const extra = Math.min(node.max, node.min + MAX_EXTRA_REPEATS) - node.min;
      const count = node.min + next(extra + 1);
      return Array.from({ length: count }, () => emit(node.node, next)).join("");
    }
  }
}
