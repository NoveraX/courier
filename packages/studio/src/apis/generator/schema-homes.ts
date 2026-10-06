import { TOP_LEVEL } from "../parser/top-level";
import type { ParsedSpec } from "../parser/types";
import { collectGroupSchemas } from "./schema-refs";

/**
 * Where each of a specification's schemas is declared: in the schemas
 * module of the one group whose endpoints use it, or — used by the API's
 * own endpoints, or by more than one group — once, in the import's own
 * module, which the groups import it from. Declared in every group that
 * used it, Stripe's schemas, which nearly all refer to each other, came to
 * 59 MB over its 78 resources instead of 4.7 MB.
 *
 * Decided over the whole specification, as generated, never over a
 * selection: adding endpoints later finds every schema where the first
 * write put it. A schema a group uses brings in every schema it refers to,
 * so a schema used by several groups only refers to schemas used by them
 * all, and the import's module never needs a group's.
 *
 * @param whole - The whole specification, grouped as the import generates it
 * @returns The group declaring each schema an endpoint uses, by schema name;
 *   {@link TOP_LEVEL} for the import's own module
 * @example
 * ```ts
 * schemaHomes(transformSpec(spec, { groupBy: "tag" })).get("Pet"); // "pets"
 * ```
 */
export function schemaHomes(whole: ParsedSpec): ReadonlyMap<string, string> {
  const homes = new Map<string, string>();
  for (const group of whole.groups) {
    for (const name of collectGroupSchemas(group, whole)) {
      const home = homes.get(name);
      if (home === undefined) homes.set(name, group.name);
      else if (home !== group.name) homes.set(name, TOP_LEVEL);
    }
  }
  return homes;
}
