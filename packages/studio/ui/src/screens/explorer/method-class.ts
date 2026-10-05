import { methodChip, methodText } from "@/design/method-color";

/**
 * The colour a method label is written in: an HTTP method's own, a
 * WebSocket's in the keyword colour, an event stream's in the brand's.
 *
 * @param label - The label, as `methodLabelOf` writes it
 * @returns The text class
 * @example
 * ```ts
 * methodClassOf("WS"); // "text-syntax-keyword"
 * ```
 */
export function methodClassOf(label: string): string {
  if (label === "WS") return "text-syntax-keyword";
  return label === "SSE" ? "text-brand" : methodText(label);
}

/**
 * A method label's chip: its colour on a tint of it.
 *
 * @param label - The label, as `methodLabelOf` writes it
 * @returns The classes
 * @example
 * ```ts
 * methodChipOf("SSE"); // "bg-brand/13 text-brand"
 * ```
 */
export function methodChipOf(label: string): string {
  if (label === "WS") return "bg-syntax-keyword/13 text-syntax-keyword";
  return label === "SSE" ? "bg-brand/13 text-brand" : methodChip(label);
}
