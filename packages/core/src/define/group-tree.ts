import type { GroupOptions } from "../http-client/types";

/** What separates the names in a group's path: `billing.invoices`. */
export const GROUP_PATH_SEPARATOR = ".";

/** A group as its source holds it: its endpoints, and its own settings under `options`. */
export type GroupNode = Record<string, unknown> & { options?: GroupOptions };

/** A group of a source, found by walking it: where it sits, and the groups above it. */
export interface PlacedGroup {
  /** Its path from the source: `billing.invoices`. */
  path: string;
  group: GroupNode;
  /** The groups from the top one down to this one, itself last. */
  chain: readonly GroupNode[];
}

/**
 * The names in a group's path, from the source down.
 *
 * @param path - The path, `billing.invoices`; `""` for the source itself
 * @returns The names, none for the source
 * @example
 * ```ts
 * groupNames("billing.invoices"); // → ["billing", "invoices"]
 * ```
 */
export function groupNames(path: string): string[] {
  return path === "" ? [] : path.split(GROUP_PATH_SEPARATOR);
}

/**
 * The groups a source or a group holds under `options.groups`, by name:
 * only its own fields, and only objects.
 *
 * @param holder - A source, a group, or anything else
 * @returns The groups, none for anything that holds none
 * @example
 * ```ts
 * Object.keys(subGroupsOf(api)); // → ["billing", "users"]
 * ```
 */
export function subGroupsOf(holder: unknown): ReadonlyMap<string, GroupNode> {
  const groups = ownField(ownField(holder, "options"), "groups");
  const found = new Map<string, GroupNode>();
  if (!isObject(groups)) return found;
  for (const [name, group] of Object.entries(groups)) {
    if (isGroupNode(group)) found.set(name, group);
  }
  return found;
}

/**
 * The groups a path passes through, from the top one down.
 *
 * @param source - The source the path starts at
 * @param path - The group's path; `""` for the source itself
 * @returns The groups, the one the path names last; `undefined` when a name is missing
 * @example
 * ```ts
 * groupChain(api, "billing.invoices")?.length; // → 2
 * ```
 */
export function groupChain(source: unknown, path: string): GroupNode[] | undefined {
  const chain: GroupNode[] = [];
  let holder: unknown = source;
  for (const name of groupNames(path)) {
    const group = subGroupsOf(holder).get(name);
    if (group === undefined) return undefined;
    chain.push(group);
    holder = group;
  }
  return chain;
}

/**
 * Each group of a source, its sub-groups after it, at any depth.
 *
 * @param source - The source
 * @returns Every group, with its path and the groups above it
 * @example
 * ```ts
 * [...eachGroup(api)].map((g) => g.path); // → ["billing", "billing.invoices", "users"]
 * ```
 */
export function* eachGroup(source: unknown): Generator<PlacedGroup> {
  yield* groupsBelow(source, "", []);
}

function* groupsBelow(
  holder: unknown,
  at: string,
  above: readonly GroupNode[],
): Generator<PlacedGroup> {
  for (const [name, group] of subGroupsOf(holder)) {
    const path = at === "" ? name : `${at}${GROUP_PATH_SEPARATOR}${name}`;
    const chain = [...above, group];
    yield { path, group, chain };
    yield* groupsBelow(group, path, chain);
  }
}

function ownField(value: unknown, key: string): unknown {
  return isObject(value) && Object.hasOwn(value, key) ? value[key] : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/* A group's settings, when it has any, are an object like a source's. */
function isGroupNode(value: unknown): value is GroupNode {
  return isObject(value) && (value.options === undefined || isObject(value.options));
}
