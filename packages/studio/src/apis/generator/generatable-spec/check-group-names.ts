import { isNode } from "../../parser/spec-node";
import type { SpecPath } from "./spec-path";

/**
 * Check what tells the groups apart, across the whole list: no two share a
 * name, since each is written to its own folder; each parent names a group
 * of the specification; and no chain of parents loops, since a group in one
 * would be generated inside nothing. The parser gives none of these, as it
 * names groups apart and drops the parents of a loop.
 *
 * @param listed - The specification's groups, each already checked as a node
 * @param at - Where the list is
 * @throws {InvalidSpecError} For the first group refused
 * @example
 * ```ts
 * checkGroupNames(spec.groups, SpecPath.root().field("groups"));
 * ```
 */
export function checkGroupNames(listed: unknown, at: SpecPath): void {
  if (!Array.isArray(listed)) return;
  const groups: readonly unknown[] = listed;
  const parentOf = new Map<unknown, unknown>();
  groups.forEach((group, index) => {
    if (!isNode(group)) return;
    if (parentOf.has(group.name)) {
      at.index(index).field("name").refuse(group.name, "another group has the name");
    }
    parentOf.set(group.name, group.parent ?? undefined);
  });
  groups.forEach((group, index) => {
    if (!isNode(group) || group.parent == null || parentOf.has(group.parent)) return;
    at.index(index).field("parent").refuse(group.parent, "it names no group of the specification");
  });
  checkParentChains(groups, parentOf, at);
}

/* Each chain walked once: one found free of a loop is not walked again. */
function checkParentChains(
  groups: readonly unknown[],
  parentOf: ReadonlyMap<unknown, unknown>,
  at: SpecPath,
): void {
  const settled = new Set<unknown>();
  groups.forEach((group, index) => {
    if (!isNode(group)) return;
    const walked = new Set<unknown>();
    for (let name: unknown = group.name; name !== undefined; name = parentOf.get(name)) {
      if (settled.has(name)) break;
      if (walked.has(name)) {
        at.index(index).field("parent").refuse(group.parent, "its chain of parents loops");
      }
      walked.add(name);
    }
    for (const name of walked) settled.add(name);
  });
}
