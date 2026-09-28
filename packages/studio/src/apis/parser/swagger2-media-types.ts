/**
 * The media types a Swagger 2.0 operation sends, from its own `consumes` or
 * the document's.
 */

import { fieldOf, type SpecNode } from "./spec-node";

const URLENCODED = "application/x-www-form-urlencoded";
const MULTIPART = "multipart/form-data";

function consumesOf(op: SpecNode, spec: SpecNode): readonly unknown[] {
  const own = fieldOf(op, "consumes");
  const consumes = Array.isArray(own) ? own : fieldOf(spec, "consumes");
  return Array.isArray(consumes) ? consumes : [];
}

/**
 * The media type a body parameter is sent as: the first the operation
 * consumes, JSON when it names none.
 *
 * @param op - The operation
 * @param spec - The document
 * @returns The media type
 * @example
 * ```ts
 * bodyMediaType({ consumes: ["application/xml"] }, spec); // "application/xml"
 * ```
 */
export function bodyMediaType(op: SpecNode, spec: SpecNode): string {
  const [first] = consumesOf(op, spec);
  return typeof first === "string" ? first : "application/json";
}

/**
 * The media type a form is sent as.
 *
 * Swagger 2.0 sends form fields url-encoded or as multipart, and a form that
 * uploads a file only as multipart. Taking the first type `consumes` lists
 * called a form described beside `application/json` a JSON body, and a form
 * whose operation lists nothing was taken for JSON too.
 *
 * @param op - The operation
 * @param spec - The document
 * @param fields - The form's fields
 * @returns The media type
 * @example
 * ```ts
 * formMediaType(op, spec, [{ name: "avatar", type: "file" }]); // "multipart/form-data"
 * ```
 */
export function formMediaType(op: SpecNode, spec: SpecNode, fields: readonly SpecNode[]): string {
  if (fields.some((field) => field.type === "file")) return MULTIPART;
  const declared = consumesOf(op, spec).find((type) => type === URLENCODED || type === MULTIPART);
  return typeof declared === "string" ? declared : URLENCODED;
}
