import type { ParsedGroup } from "../parser/types";

/**
 * The names of the groups still generated once some endpoints are left
 * out: every group that keeps an endpoint, and every group it sits inside,
 * which it is generated in. A group of OpenAPI 3.2 that only holds other
 * groups is kept while one of them keeps an endpoint. Walked without
 * recursion, each group once, so a chain of parents that loops back ends.
 *
 * @param groups - The specification's groups, their endpoints already selected
 * @returns The names of the groups to keep
 * @example
 * ```ts
 * groupsHoldingEndpoints([
 *   { name: "billing", description: "", prefix: "", endpoints: [] },
 *   { name: "invoices", description: "", prefix: "", parent: "billing", endpoints: [list] },
 * ]); // Set { "invoices", "billing" }
 * ```
 */
export function groupsHoldingEndpoints(groups: readonly ParsedGroup[]): ReadonlySet<string> {
  const parentOf = new Map(groups.map((group) => [group.name, group.parent ?? undefined]));
  const held = new Set<string>();
  for (const group of groups) {
    if (group.endpoints.length === 0) continue;
    for (let at: string | undefined = group.name; at !== undefined; at = parentOf.get(at)) {
      if (held.has(at)) break;
      held.add(at);
    }
  }
  return held;
}
