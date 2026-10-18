/**
 * The source of an encoding object, as `formBody` and `formQuery` take it.
 */

import type { FieldEncoding } from "../parser/types";
import { jsLiteral, objectKey } from "./literals";

/**
 * Write how each field is encoded as an object literal.
 *
 * @param encoding - Each field's encoding, by name
 * @returns The literal
 * @example
 * ```ts
 * encodingLiteral({ metadata: { style: "deepObject", explode: true } });
 * // → '{ metadata: { style: "deepObject", explode: true } }'
 * ```
 */
export function encodingLiteral(encoding: Readonly<Record<string, FieldEncoding>>): string {
  const fields = Object.entries(encoding).map(([name, field]) => {
    const parts = [
      field.style === undefined ? null : `style: ${jsLiteral(field.style)}`,
      field.explode === undefined ? null : `explode: ${field.explode}`,
    ].filter((part) => part !== null);
    return `${objectKey(name)}: { ${parts.join(", ")} }`;
  });
  return `{ ${fields.join(", ")} }`;
}
