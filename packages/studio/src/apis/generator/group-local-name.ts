/**
 * The local name a group is imported under in source.ts. A group named like
 * the source itself would be declared twice there; it is imported under an
 * alias instead, which no binding can equal, since bindings hold `_` only
 * before a leading digit. The key under `groups` stays the group's own name.
 * Names the generated files use themselves never reach here: `toBindingName`
 * renames them.
 *
 * @param group - The group's binding
 * @param sourceBinding - The binding the source is exported under
 * @returns The name to import the group under
 * @example
 * ```ts
 * groupLocalName("store", "pets"); // "store"
 * groupLocalName("pets", "pets"); // "group_pets"
 * ```
 */
export function groupLocalName(group: string, sourceBinding: string): string {
  return group === sourceBinding ? `group_${group}` : group;
}
