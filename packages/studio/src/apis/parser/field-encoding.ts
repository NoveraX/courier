/**
 * How a field of a url-encoded body, or a query parameter, is written, in
 * OpenAPI 3's terms: its own `style` and `explode`, or Swagger 2.0's
 * `collectionFormat`.
 */

import type { FieldEncoding } from "./types";

/**
 * The encoding a specification declares, keeping only a style OpenAPI
 * defines for these places and a boolean `explode`.
 *
 * @param style - The declared `style`
 * @param explode - The declared `explode`
 * @returns The encoding, or `undefined` when neither says anything
 * @example
 * ```ts
 * declaredEncoding("deepObject", true); // → { style: "deepObject", explode: true }
 * declaredEncoding("matrix", undefined); // → undefined
 * ```
 */
export function declaredEncoding(style: unknown, explode: unknown): FieldEncoding | undefined {
  const known = styleOf(style);
  const exploded = typeof explode === "boolean" ? explode : undefined;
  if (known === undefined && exploded === undefined) return undefined;
  return { ...(known && { style: known }), ...(exploded !== undefined && { explode: exploded }) };
}

/**
 * How Swagger 2.0 joins a list's items, in OpenAPI 3's terms; `csv` when it
 * does not say. Tabs have no OpenAPI 3 style, and are sent as commas.
 *
 * @param collectionFormat - The declared `collectionFormat`
 * @returns The encoding
 * @example
 * ```ts
 * collectionEncoding("pipes"); // → { style: "pipeDelimited", explode: false }
 * collectionEncoding(undefined); // → { style: "form", explode: false }
 * ```
 */
export function collectionEncoding(collectionFormat: unknown): FieldEncoding {
  if (collectionFormat === "multi") return { style: "form", explode: true };
  if (collectionFormat === "ssv") return { style: "spaceDelimited", explode: false };
  if (collectionFormat === "pipes") return { style: "pipeDelimited", explode: false };
  return { style: "form", explode: false };
}

/**
 * Whether an encoding writes a value as OpenAPI's default does: `form`,
 * exploded.
 *
 * @param encoding - The encoding
 * @returns Whether it is the default
 * @example
 * ```ts
 * isDefaultEncoding({ explode: true }); // → true
 * isDefaultEncoding({ style: "deepObject" }); // → false
 * ```
 */
export function isDefaultEncoding(encoding: FieldEncoding): boolean {
  const style = encoding.style ?? "form";
  return style === "form" && (encoding.explode ?? true);
}

function styleOf(value: unknown): FieldEncoding["style"] {
  return value === "form" ||
    value === "spaceDelimited" ||
    value === "pipeDelimited" ||
    value === "deepObject"
    ? value
    : undefined;
}
