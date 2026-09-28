import { formatValues, matchesFormat } from "./gen-format";
import { deterministicHex } from "./gen-helpers";
import { samplePattern } from "./pattern-sample";
import type { ValueConstraints } from "./schema-introspect";

/**
 * Turn a heuristic string into one its schema accepts. The heuristic value
 * is kept when it passes, then trimmed or padded to the declared length;
 * a format's own values come next, and a value generated from the pattern
 * last.
 *
 * @param heuristic   The value field-name heuristics produced (`"Nickname 1"`)
 * @param constraints Length, format, pattern and affixes read from the schema
 * @param index       Record index, so generated values differ per record
 * @returns The first candidate that satisfies every constraint, or the
 *   closest one when the constraints cannot all be met
 * @example
 * ```ts
 * fitString("Nickname 1", { maxLength: 8 }, 1); // "Nickname"
 * fitString("Pet Id 1", { format: "uuid" }, 1);  // "7f958ceb-7a80-4478-9f50-e10ac1c6c171"
 * ```
 */
export function fitString(heuristic: string, constraints: ValueConstraints, index: number): string {
  const format = constraints.format;
  const raw = format ? [heuristic, ...formatValues(format, index)] : [heuristic];
  const candidates = raw.map((value) => shapeString(value, constraints, index));
  const accepted = candidates.find((value) => satisfies(value, constraints));
  if (accepted !== undefined) return accepted;
  return fromPatterns(constraints, index) ?? candidates[candidates.length - 1] ?? heuristic;
}

function satisfies(value: string, c: ValueConstraints): boolean {
  if (c.minLength !== undefined && value.length < c.minLength) return false;
  if (c.maxLength !== undefined && value.length > c.maxLength) return false;
  if (c.startsWith !== undefined && !value.startsWith(c.startsWith)) return false;
  if (c.endsWith !== undefined && !value.endsWith(c.endsWith)) return false;
  if (c.includes?.some((part) => !value.includes(part))) return false;
  if (c.format !== undefined && !matchesFormat(c.format, value)) return false;
  return (c.patterns ?? []).every((pattern) => pattern.test(value));
}

function fromPatterns(c: ValueConstraints, index: number): string | undefined {
  for (const pattern of c.patterns ?? []) {
    const sampled = samplePattern(pattern, index);
    if (sampled !== undefined && satisfies(sampled, c)) return sampled;
  }
  return undefined;
}

/** Add missing affixes and bring the value within its length bounds */
function shapeString(value: string, c: ValueConstraints, index: number): string {
  const head = c.startsWith ?? "";
  const tail = c.endsWith ?? "";
  let core = value.startsWith(head) ? value.slice(head.length) : value;
  if (tail && core.endsWith(tail)) core = core.slice(0, core.length - tail.length);
  for (const part of c.includes ?? []) {
    if (!`${head}${core}${tail}`.includes(part)) core += part;
  }
  const reserved = head.length + tail.length;
  const min = (c.minLength ?? 0) - reserved;
  const max = (c.maxLength ?? Number.POSITIVE_INFINITY) - reserved;
  return `${head}${fitLength(core, min, max, index)}${tail}`;
}

function fitLength(core: string, min: number, max: number, index: number): string {
  const cut = core.length > max ? core.slice(0, Math.max(max, 0)).trimEnd() : core;
  return cut.length >= min ? cut : cut + deterministicHex(index, min - cut.length);
}
