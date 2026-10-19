import { placesIn } from "./document-places";
import { MAX_PATTERN_LENGTH } from "./max-pattern-length";
import { type SpecNode, textAt } from "./spec-node";
import type { ParsedSpec, SkippedOperation } from "./types";

/* The patterns left out while a specification is parsed; none outside a parse. */
let leftOut: Set<string> | undefined;

/**
 * Note a pattern a schema's values will not be checked against, so the
 * parse under way says so. Outside a parse it is not noted.
 *
 * @param source - The pattern, as the specification writes it
 * @example
 * ```ts
 * if (source.length > MAX_PATTERN_LENGTH) leaveOutPattern(source);
 * ```
 */
export function leaveOutPattern(source: string): void {
  leftOut?.add(source);
}

/**
 * Parse a specification, and add to what it says it left out each place
 * the document writes a pattern the parse left out — as a JSON pointer, so
 * whoever imports it knows which field accepts any text.
 *
 * @param document - The specification as written
 * @param parse - The parse, which notes each pattern it leaves out
 * @returns What the parse returns, with the patterns it left out among `skipped`
 * @example
 * ```ts
 * const spec = withLeftOutPatterns(document, () => parseOpenApi3(document));
 * // spec.skipped → [{ method: "PATTERN", path: "#/components/schemas/Zone/properties/name", reason: "…" }]
 * ```
 */
export function withLeftOutPatterns(document: SpecNode, parse: () => ParsedSpec): ParsedSpec {
  const outer = leftOut;
  const noted = new Set<string>();
  leftOut = noted;
  let parsed: ParsedSpec;
  try {
    parsed = parse();
  } finally {
    leftOut = outer;
  }
  if (noted.size === 0) return parsed;
  return { ...parsed, skipped: [...parsed.skipped, ...placesOf(document, noted)] };
}

/* Each object that writes one of the patterns, where the document writes it. */
function placesOf(document: SpecNode, patterns: ReadonlySet<string>): SkippedOperation[] {
  const writesOne = (node: SpecNode) => patterns.has(textAt(node, "pattern") ?? "");
  return placesIn(document, writesOne).map(({ pointer, node }) =>
    note(pointer, textAt(node, "pattern") ?? ""),
  );
}

function note(pointer: string, pattern: string): SkippedOperation {
  return {
    method: "PATTERN",
    path: pointer,
    reason: `its pattern is ${pattern.length} characters long, more than the ${MAX_PATTERN_LENGTH} Studio compiles, so values are not checked against it`,
  };
}
