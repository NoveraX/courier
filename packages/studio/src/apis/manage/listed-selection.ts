import { type GroupBy, placeEndpoints } from "../generator/endpoint-placements";
import { qualifiedName } from "../parser/top-level";
import type { ParsedSpec } from "../parser/types";

/** A selection made from an import's listing, as the generator takes it. */
export interface ListedSelection {
  /** The endpoints picked, by the specification's group and under its names. */
  selection: Record<string, string[]>;
  /**
   * What was picked that the specification does not generate, as
   * `group.endpoint`, the API's own endpoints by their name alone.
   */
  unknown: string[];
}

/**
 * Turn endpoints picked from an import's listing — its groups and names as
 * its files have them — into the selection the generator takes, which names
 * them as the specification does.
 *
 * @param spec - The parsed specification
 * @param groupBy - How the import groups its endpoints
 * @param picked - The endpoints picked, by the group they are listed in
 * @returns The selection, and what matched no endpoint
 * @example
 * ```ts
 * listedSelection(spec, "single", { "": ["getStoreById"] });
 * // → { selection: { store: ["getById"] }, unknown: [] }
 * ```
 */
export function listedSelection(
  spec: ParsedSpec,
  groupBy: GroupBy,
  picked: Readonly<Record<string, readonly string[]>>,
): ListedSelection {
  /* Keyed apart by a character no name holds, so the API's own `health` is not a group's. */
  const keyOf = (group: string, name: string): string => `${group}\u0000${name}`;
  const wanted = new Map(
    Object.entries(picked).flatMap(([group, names]) =>
      names.map((name) => [keyOf(group, name), qualifiedName(group, name)] as const),
    ),
  );
  const selection = new Map<string, string[]>();
  for (const { source, sourceGroup, group, endpoint } of placeEndpoints(spec, groupBy)) {
    if (!wanted.delete(keyOf(group.name, endpoint.name))) continue;
    selection.set(sourceGroup, [...(selection.get(sourceGroup) ?? []), source.name]);
  }
  return { selection: Object.fromEntries(selection), unknown: [...wanted.values()] };
}
