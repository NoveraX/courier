import type { ObjectExpression, Span } from "oxc-parser";
import { Visitor } from "oxc-parser";
import { closingRun } from "./closing-run";
import type { ParsedSource } from "./parse-source";
import { trailingCommaAfter } from "./trailing-comma-after";

/**
 * Whether a file ends its multi-line object and array literals with a comma,
 * by majority. A single-line literal says nothing either way: formatters
 * leave the comma out of those whatever their setting. A multi-line mocks
 * object, when given, decides on its own: the new entries join it, so they
 * follow it rather than the rest of the file.
 *
 * @param parsed - The parsed file
 * @param mocksObject - The object new entries join, if any
 * @returns The mocks object's own style when it shows one; else the majority,
 *   or `true` (Biome's default) when the file has no multi-line literal
 *
 * @example
 * ```ts
 * detectTrailingCommas(parseSource("x.ts", "const a = [\n  1\n];\n")); // → false
 * ```
 */
export function detectTrailingCommas(
  parsed: ParsedSource,
  mocksObject: ObjectExpression | null = null,
): boolean {
  const own = mocksObject && endsWithComma(parsed, mocksObject.properties, mocksObject.end - 1);
  if (typeof own === "boolean") return own;
  let withComma = 0;
  let without = 0;
  const tally = (items: ReadonlyArray<Span | null>, close: number): void => {
    const comma = endsWithComma(parsed, items, close);
    if (comma === true) withComma += 1;
    if (comma === false) without += 1;
  };
  new Visitor({
    ObjectExpression: (node) => tally(node.properties, node.end - 1),
    ArrayExpression: (node) => tally(node.elements, node.end - 1),
  }).visit(parsed.program);
  return withComma >= without;
}

/* Whether a list that spans lines ends with a comma after its last item;
   `null` for a list on one line or without items. */
function endsWithComma(
  parsed: ParsedSource,
  items: ReadonlyArray<Span | null>,
  close: number,
): boolean | null {
  const last = items[items.length - 1];
  if (last === undefined || last === null || !closingRun(parsed.text, close).block) return null;
  return trailingCommaAfter(parsed.text, last.end, parsed.commentEnds) !== null;
}
