import { pointerSegment } from "./pointer-segment";
import { isNode, type SpecNode } from "./spec-node";

/** An object of a document, and the JSON pointer of where the document writes it. */
export interface DocumentPlace {
  readonly pointer: string;
  readonly node: SpecNode;
}

/**
 * The objects of a document a parse wants to point at, by the JSON pointer
 * of where the document writes each: found without recursion — a document
 * can nest deeper than the stack goes — and each object once, since YAML's
 * aliases can make one object appear in many places, or inside itself.
 *
 * @param document - The document as read from its text
 * @param wanted - Whether an object is one to point at
 * @returns The places of the objects wanted, by pointer
 * @example
 * ```ts
 * placesIn(document, (node) => node.pattern === long).map((place) => place.pointer);
 * // → ["#/components/schemas/Zone/properties/name"]
 * ```
 */
export function placesIn(document: SpecNode, wanted: (node: SpecNode) => boolean): DocumentPlace[] {
  const places: DocumentPlace[] = [];
  const seen = new Set<object>();
  const pending: Array<{ value: unknown; pointer: string }> = [{ value: document, pointer: "#" }];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const { value, pointer } = next;
    if (typeof value !== "object" || value === null || seen.has(value)) continue;
    seen.add(value);
    if (isNode(value) && wanted(value)) places.push({ pointer, node: value });
    const children: Array<[string, unknown]> = Object.entries(value);
    for (const [key, child] of children) {
      pending.push({ value: child, pointer: `${pointer}/${pointerSegment(key)}` });
    }
  }
  return places.sort((a, b) => a.pointer.localeCompare(b.pointer));
}
