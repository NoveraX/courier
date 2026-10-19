import type { DiskGroupInfo, SpecGroupInfo } from "./inventory-indexers";

/** How many endpoints two groups share, by one group's name and then the other's. */
type SharedCounts = Map<string, Map<string, number>>;

/**
 * Pair each group of the specification with the group on disk it is. A
 * group that keeps its name and one of its endpoints is the same group. Of
 * the rest, a group on disk is the group of the specification holding the
 * most of its endpoints, where each is the other's one best match: a group
 * renamed, as `undefined` became `undefinedGroup`, or a group whose tag
 * spells no name, named `group3` once and after its path's segment, or
 * `group`, now. Whatever is left pairs by name. Paired by name alone, a
 * renamed group read as gone, and its endpoints were dropped.
 *
 * @param specMap - The specification's groups, by name
 * @param diskMap - The groups on disk, by name
 * @returns The group on disk each group of the specification is, by the specification's name
 * @example
 * ```ts
 * pairedGroups(specMap, diskMap).get("undefinedGroup"); // → "undefined"
 * ```
 */
export function pairedGroups(
  specMap: ReadonlyMap<string, SpecGroupInfo>,
  diskMap: ReadonlyMap<string, DiskGroupInfo>,
): Map<string, string> {
  const byDisk = sharedCounts(specMap, diskMap);
  const bySpec = transposed(byDisk);
  const pairs = new Map<string, string>();
  const paired = new Set<string>();
  const join = (spec: string, disk: string): void => {
    pairs.set(spec, disk);
    paired.add(disk);
  };
  for (const name of diskMap.keys()) {
    if (specMap.has(name) && (byDisk.get(name)?.get(name) ?? 0) > 0) join(name, name);
  }
  /* Round by round, among the groups still open, so a match is never decided by order. */
  for (let found = matched(byDisk, bySpec, diskMap, specMap, pairs); found.length > 0; ) {
    for (const [spec, disk] of found) join(spec, disk);
    found = matched(byDisk, bySpec, diskMap, specMap, pairs);
  }
  for (const name of diskMap.keys()) {
    if (!paired.has(name) && specMap.has(name) && !pairs.has(name)) join(name, name);
  }
  return pairs;
}

/* The pairs of groups, neither paired yet, each the other's one best match. */
function matched(
  byDisk: SharedCounts,
  bySpec: SharedCounts,
  diskMap: ReadonlyMap<string, DiskGroupInfo>,
  specMap: ReadonlyMap<string, SpecGroupInfo>,
  pairs: ReadonlyMap<string, string>,
): Array<[string, string]> {
  const taken = new Set(pairs.values());
  const openDisks = new Set([...diskMap.keys()].filter((name) => !taken.has(name)));
  const openSpecs = new Set([...specMap.keys()].filter((name) => !pairs.has(name)));
  const found: Array<[string, string]> = [];
  for (const disk of openDisks) {
    const spec = bestAmong(byDisk.get(disk), openSpecs);
    if (spec !== undefined && bestAmong(bySpec.get(spec), openDisks) === disk) {
      found.push([spec, disk]);
    }
  }
  return found;
}

/* For each group on disk, the groups of the specification it shares endpoints with, and how many. */
function sharedCounts(
  specMap: ReadonlyMap<string, SpecGroupInfo>,
  diskMap: ReadonlyMap<string, DiskGroupInfo>,
): SharedCounts {
  const holders = new Map<string, string[]>();
  for (const [spec, info] of specMap) {
    for (const name of new Set(info.endpoints.map((endpoint) => endpoint.name))) {
      const holding = holders.get(name);
      if (holding === undefined) holders.set(name, [spec]);
      else holding.push(spec);
    }
  }
  const counts: SharedCounts = new Map();
  for (const [disk, info] of diskMap) {
    const shared = new Map<string, number>();
    for (const name of new Set(info.endpoints)) {
      for (const spec of holders.get(name) ?? []) shared.set(spec, (shared.get(spec) ?? 0) + 1);
    }
    counts.set(disk, shared);
  }
  return counts;
}

function transposed(counts: SharedCounts): SharedCounts {
  const flipped: SharedCounts = new Map();
  for (const [from, shared] of counts) {
    for (const [to, count] of shared) {
      const row = flipped.get(to);
      if (row === undefined) flipped.set(to, new Map([[from, count]]));
      else row.set(from, count);
    }
  }
  return flipped;
}

/* The one open name sharing the most endpoints; none where two share as many. */
function bestAmong(
  shared: ReadonlyMap<string, number> | undefined,
  open: ReadonlySet<string>,
): string | undefined {
  let best: string | undefined;
  let most = 0;
  let tied = false;
  for (const [name, count] of shared ?? []) {
    if (!open.has(name) || count < most) continue;
    tied = count === most;
    if (!tied) best = name;
    most = count;
  }
  return tied ? undefined : best;
}
