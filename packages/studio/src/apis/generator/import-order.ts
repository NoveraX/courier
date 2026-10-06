const SOURCE = /\sfrom\s+"([^"]*)"/;
const DIGITS = /^\d+/;

/* Where a character sorts: marks first, `_` before the rest, then digits, then
   letters, each letter's capital just before its small form. */
function rank(char: string): number {
  if (char === "_") return 0;
  if (/\d/.test(char)) return 2000;
  const lower = char.toLowerCase();
  if (lower >= "a" && lower <= "z") {
    return 3000 + (lower.charCodeAt(0) - 97) * 2 + (char === lower ? 1 : 0);
  }
  return 1 + (char.codePointAt(0) ?? 0) / 0x110000;
}

/**
 * Order two names as Biome's import organizer orders imported names and
 * path segments: digits by their value, so `Pet2` comes before `Pet10`, and
 * letters alphabetically, a capital just before its small form, so `PetA`
 * comes before `pet`; a name before the longer names it starts.
 *
 * @param a - A name
 * @param b - Another
 * @returns Negative when `a` comes first, positive when `b` does, 0 when they are equal
 * @example
 * ```ts
 * compareNames("Pet10Schema", "Pet2Schema"); // > 0
 * ```
 */
export function compareNames(a: string, b: string): number {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const left = DIGITS.exec(a.slice(i))?.[0];
    const right = DIGITS.exec(b.slice(j))?.[0];
    if (left !== undefined && right !== undefined) {
      const order = Number(left) - Number(right) || left.length - right.length;
      if (order !== 0) return order;
      i += left.length;
      j += right.length;
      continue;
    }
    const order = rank(a.charAt(i)) - rank(b.charAt(j));
    if (order !== 0) return order;
    i += 1;
    j += 1;
  }
  return a.length - i - (b.length - j);
}

/* Packages first, then paths, the furthest first: `../schemas` before `./schemas`. */
function distance(source: string): number {
  if (!source.startsWith(".")) return 0;
  return source.startsWith("../") ? 1 : 2;
}

/**
 * Order two module specifiers as linters order the statements naming them:
 * packages before paths, a parent's paths before the folder's own, then
 * segment by segment as {@link compareNames} orders names — `../a/index`
 * before `../a-b/index`, `../v2/index` before `../v10/index`.
 *
 * @param a - A specifier
 * @param b - Another
 * @returns Negative when `a` comes first, positive when `b` does, 0 when they are equal
 * @example
 * ```ts
 * compareSpecifiers("./schemas", "../schemas"); // > 0
 * ```
 */
export function compareSpecifiers(a: string, b: string): number {
  const byDistance = distance(a) - distance(b);
  if (byDistance !== 0) return byDistance;
  const left = a.split("/");
  const right = b.split("/");
  for (let at = 0; at < Math.min(left.length, right.length); at += 1) {
    const order = compareNames(left[at] ?? "", right[at] ?? "");
    if (order !== 0) return order;
  }
  return left.length - right.length;
}

/**
 * Sort import or re-export statements by the module each names, as Biome's
 * import organizer sorts them, so a generated file passes a linter that
 * checks the order without being formatted first. Statements naming one
 * module keep their order.
 *
 * @param statements - One statement per entry, each naming its module with `from "…"`
 * @returns The statements, sorted
 * @example
 * ```ts
 * sortedStatements(['import { user } from "./user/index";', 'import { pet } from "./pet/index";']);
 * // → ['import { pet } from "./pet/index";', 'import { user } from "./user/index";']
 * ```
 */
export function sortedStatements(statements: readonly string[]): string[] {
  const sourceOf = (statement: string): string => SOURCE.exec(statement)?.[1] ?? "";
  return [...statements].sort((a, b) => compareSpecifiers(sourceOf(a), sourceOf(b)));
}
