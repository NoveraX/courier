/**
 * The schema a `$ref` stands for.
 */

import { componentIdentifier, declaredComponentName } from "./component-identifier";
import { expandPointer } from "./pointer-refs";
import { convertSchema } from "./schema-conversion";
import type { ParsedSchema, SpecNode } from "./types";

/**
 * Convert a reference: a component by its name, and anything else — a place
 * inside a path or another schema, where a bundled specification keeps it —
 * from what it points at. Named after the pointer's last segment, those
 * became types such as `Items` and `_1` that nothing declared.
 *
 * @param name - The name the converted schema takes
 * @param ref - The reference
 * @param description - What the referring schema says about it
 * @param spec - The whole specification, for following the reference
 * @returns A reference to a component, or the schema pointed at
 * @example
 * ```ts
 * referencedSchema("Owner", "#/components/schemas/User", undefined, spec);
 * // → { name: "Owner", type: "ref", refName: "User" }
 * ```
 */
export function referencedSchema(
  name: string,
  ref: string,
  description: string | undefined,
  spec: SpecNode | undefined,
): ParsedSchema {
  const component = declaredComponentName(ref, spec);
  if (component !== undefined) {
    return { name, type: "ref", refName: componentIdentifier(spec, component), description };
  }
  return expandPointer<ParsedSchema>(
    ref,
    spec,
    (target) => {
      const converted = convertSchema(name, target, spec);
      return description === undefined ? converted : { ...converted, description };
    },
    () => ({ name, type: "any", description }),
  );
}
