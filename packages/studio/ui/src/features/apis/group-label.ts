/** The key the API's own endpoints, those in no group, are listed under. */
export const TOP_LEVEL = "";

/**
 * How a group is named on screen: by its name, or as the top level for the
 * API's own endpoints, which sit in no group.
 *
 * @param name - The group's name; `""` for the API itself
 * @returns The label
 * @example
 * ```ts
 * groupLabel(""); // "Top level"
 * ```
 */
export function groupLabel(name: string): string {
  return name === TOP_LEVEL ? "Top level" : name;
}

/**
 * An endpoint's name as a client reaches it: through its group, or on its
 * own for one of the API itself.
 *
 * @param group - The group's name; `""` for the API itself
 * @param name - The endpoint's name
 * @returns `group.endpoint`, or `endpoint` alone
 * @example
 * ```ts
 * endpointLabel("", "health"); // "health"
 * ```
 */
export function endpointLabel(group: string, name: string): string {
  return group === TOP_LEVEL ? name : `${group}.${name}`;
}
