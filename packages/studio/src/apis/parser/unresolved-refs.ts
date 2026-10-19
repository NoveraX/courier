import { placesIn } from "./document-places";
import { refTarget } from "./ref-utils";
import { asNode, type SpecNode, textAt } from "./spec-node";
import type { ParsedSpec, SkippedOperation } from "./types";

/* The references the parse under way found pointing nowhere, each with what it read in their place; none outside a parse. */
let unresolved: Map<string, string> | undefined;

/**
 * Note a reference that points nowhere — outside the document, at a part
 * the document does not hold, or through an escape that decodes to no
 * text — so the parse under way says so. Outside a parse it is not noted.
 *
 * @param ref - The reference, as the document writes it
 * @param reading - What the parse read in its place
 * @example
 * ```ts
 * if (refTarget(spec, ref) === undefined) noteUnresolvedRef(ref, "its value is read as unknown");
 * ```
 */
export function noteUnresolvedRef(ref: string, reading: string): void {
  if (unresolved !== undefined && !unresolved.has(ref)) unresolved.set(ref, reading);
}

/**
 * Follow a reference, and note it when it points nowhere.
 *
 * @param spec - The whole document
 * @param ref - The reference
 * @param reading - What the parse reads in its place when it points nowhere
 * @returns What it points at, or an empty schema when that is nothing
 * @example
 * ```ts
 * const body = followedRef(spec, ref, "the operation is read without a body");
 * ```
 */
export function followedRef(spec: SpecNode, ref: string, reading: string): SpecNode {
  const target = refTarget(spec, ref);
  if (target === undefined) noteUnresolvedRef(ref, reading);
  return asNode(target);
}

/**
 * Parse a specification, and add to what it says it left out each place
 * the document writes a reference the parse found pointing nowhere — as a
 * JSON pointer, so whoever imports it knows which part was read as what.
 *
 * @param document - The specification as written
 * @param parse - The parse, which notes each reference it cannot follow
 * @returns What the parse returns, with those references among `skipped`
 * @example
 * ```ts
 * const spec = withUnresolvedRefs(document, () => parseOpenApi3(document));
 * // spec.skipped → [{ method: "REF", path: "#/components/schemas/Pet/properties/owner", reason: "…" }]
 * ```
 */
export function withUnresolvedRefs(document: SpecNode, parse: () => ParsedSpec): ParsedSpec {
  const outer = unresolved;
  const noted = new Map<string, string>();
  unresolved = noted;
  let parsed: ParsedSpec;
  try {
    parsed = parse();
  } finally {
    unresolved = outer;
  }
  if (noted.size === 0) return parsed;
  return { ...parsed, skipped: [...parsed.skipped, ...placesOf(document, noted)] };
}

/* Each object that writes one of the references, where the document writes it. */
function placesOf(document: SpecNode, refs: ReadonlyMap<string, string>): SkippedOperation[] {
  const writesOne = (node: SpecNode) => refs.has(textAt(node, "$ref") ?? "");
  return placesIn(document, writesOne).map(({ pointer, node }) => {
    const ref = textAt(node, "$ref") ?? "";
    return {
      method: "REF",
      path: pointer,
      reason: `it refers to ${ref}, which this document does not hold, so ${refs.get(ref) ?? "it is left out"}`,
    };
  });
}
