/**
 * A Swagger 2.0 operation's `formData` parameters, as the request body they
 * describe: a set of named fields. Without it they vanished from the
 * generated client entirely.
 */

import { collectionEncoding } from "./field-encoding";
import { asNode, fieldOf, type SpecNode, textAt } from "./spec-node";
import { formMediaType } from "./swagger2-media-types";

/**
 * The operation with its form fields as a request body, and no longer among
 * its parameters.
 *
 * @param op - The operation
 * @param spec - The document, for the media types it consumes
 * @param parameters - The operation's parameters
 * @returns The operation converted; `undefined` when it has no form field
 * @example
 * ```ts
 * withFormBody(op, spec, [{ name: "name", in: "formData", type: "string" }]);
 * // → { …op, requestBody: { content: { "application/x-www-form-urlencoded": { schema } } }, parameters: [] }
 * ```
 */
export function withFormBody(
  op: SpecNode,
  spec: SpecNode,
  parameters: readonly unknown[],
): SpecNode | undefined {
  const fields = parameters.filter((p) => fieldOf(p, "in") === "formData").map(asNode);
  if (fields.length === 0) return undefined;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  const encoding: Record<string, unknown> = {};
  for (const field of fields) {
    const name = textAt(field, "name");
    if (name === undefined) continue;
    properties[name] = fieldSchema(field);
    if (field.type === "array") encoding[name] = collectionEncoding(field.collectionFormat);
    if (field.required) required.push(name);
  }
  const content = {
    [formMediaType(op, spec, fields)]: {
      schema: { type: "object", properties, required },
      ...(Object.keys(encoding).length > 0 && { encoding }),
    },
  };
  return {
    ...op,
    requestBody: { content },
    parameters: parameters.filter((p) => fieldOf(p, "in") !== "formData"),
  };
}

function fieldSchema(field: SpecNode): SpecNode {
  const file = field.type === "file";
  return {
    type: file ? "string" : (field.type ?? "string"),
    ...(file ? { format: "binary" } : field.format ? { format: field.format } : {}),
    ...(field.enum ? { enum: field.enum } : {}),
    ...(field.items ? { items: field.items } : {}),
    ...(field.description ? { description: field.description } : {}),
  };
}
