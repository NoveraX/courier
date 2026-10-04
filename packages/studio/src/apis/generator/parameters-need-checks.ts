import { ownValue } from "../own-value";
import { schemaTraits } from "../parser/schema-traits";
import type { ParsedParameter, ParsedSchema } from "../parser/types";
import { parameterProperty } from "./parameter-property";

/**
 * Whether checking an endpoint's parameters takes a schema: one of them is
 * constrained beyond what its type can say — itself, its items, its own
 * schema, or a schema it refers to, at any depth. Its type says the rest.
 *
 * @param params - The endpoint's parameters
 * @param schemas - The specification's named schemas, for the references
 * @returns Whether one of the parameters carries a constraint
 * @example
 * ```ts
 * parametersNeedChecks([limit], spec.schemas); // → true for `limit` with `maximum: 100`
 * ```
 */
export function parametersNeedChecks(
  params: readonly ParsedParameter[],
  schemas: Readonly<Record<string, ParsedSchema>>,
): boolean {
  const properties = Object.fromEntries(
    params.map((param) => [param.name, parameterProperty(param)]),
  );
  const queue: ParsedSchema[] = [{ name: "", type: "object", properties }];
  const seen = new Set<string>();
  for (let schema = queue.pop(); schema !== undefined; schema = queue.pop()) {
    const traits = schemaTraits(schema);
    if (traits.constrained) return true;
    for (const ref of traits.refs) {
      const target = seen.has(ref) ? undefined : ownValue(schemas, ref);
      seen.add(ref);
      if (target) queue.push(target);
    }
  }
  return false;
}
