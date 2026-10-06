/**
 * Transform parsed spec based on GenerateOptions (groupBy).
 * Applied before code generation so the generator always works with
 * a consistently shaped ParsedSpec.
 */

import { ownValue } from "../own-value";
import type { ParsedEndpoint, ParsedGroup, ParsedSpec } from "../parser/types";
import { placeEndpoints } from "./endpoint-placements";
import type { ResolvedGenerateOptions } from "./types";

/**
 * The specification as its files are generated: its endpoints grouped as
 * `groupBy` says, each under the name and path it is generated with, and
 * only the selected ones when there is a selection. Names, groups and
 * prefixes are those of the whole specification, whatever is selected.
 *
 * @param spec - The parsed specification
 * @param options - The resolved options, of which `groupBy` is read
 * @param selected - The endpoints to keep, as the specification lists them; all when `null`
 * @returns The specification regrouped, without groups left empty by the selection
 * @example
 * ```ts
 * transformSpec(spec, { ...options, groupBy: "single" }, null).groups[0]?.name; // "api"
 * ```
 */
export function transformSpec(
  spec: ParsedSpec,
  options: Pick<ResolvedGenerateOptions, "groupBy">,
  selected: ReadonlySet<ParsedEndpoint> | null = null,
): ParsedSpec {
  if (options.groupBy === "tag") {
    if (selected === null) return spec;
    const groups = spec.groups.map((group) => ({
      ...group,
      endpoints: group.endpoints.filter((e) => selected.has(e)),
    }));
    return { ...spec, groups: groups.filter((group) => holdsSelected(group, groups)) };
  }
  const groups = new Map<string, ParsedGroup>();
  for (const placement of placeEndpoints(spec, options.groupBy)) {
    if (selected !== null && !selected.has(placement.source)) continue;
    const group = groups.get(placement.group.name) ?? { ...placement.group, endpoints: [] };
    group.endpoints.push(placement.endpoint);
    groups.set(placement.group.name, group);
  }
  return { ...spec, groups: [...groups.values()] };
}

/* A group with a selected endpoint, or with one in a group inside it: a group
   kept for the groups inside it keeps them a parent to be generated in. */
function holdsSelected(group: ParsedGroup, groups: readonly ParsedGroup[]): boolean {
  if (group.endpoints.length > 0) return true;
  return groups.some((inner) => inner.parent === group.name && holdsSelected(inner, groups));
}

/**
 * The endpoints a selection names, as the specification lists them.
 *
 * @param groups - The specification's groups
 * @param selection - Endpoint names by the specification's group, or `null` for all
 * @returns The endpoints selected, or `null` for all
 * @example
 * ```ts
 * selectedEndpoints(spec.groups, { pets: ["listPets"] })?.size; // 1
 * ```
 */
export function selectedEndpoints(
  groups: readonly ParsedGroup[],
  selection: Readonly<Record<string, readonly string[]>> | null,
): ReadonlySet<ParsedEndpoint> | null {
  if (selection === null) return null;
  const selected = new Set<ParsedEndpoint>();
  for (const group of groups) {
    const names = ownValue(selection, group.name);
    if (names === undefined) continue;
    for (const endpoint of group.endpoints)
      if (names.includes(endpoint.name)) selected.add(endpoint);
  }
  return selected;
}
