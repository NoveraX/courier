import { toCamelCase, toGroupName } from "./naming-utils";

/**
 * The name a tag or a Postman folder gives its group: its own, made an
 * identifier — or, when it holds no letter or digit a name can be spelled
 * with in Latin letters, the last segment every path of
 * the group shares that is no parameter and does spell one. A group neither
 * names is called `group`, as a name made of nothing is.
 *
 * @param label - The tag or folder
 * @param shared - The segments every path of the group begins with
 * @returns The group's name, before a number tells it from another's
 * @example
 * ```ts
 * groupNameOf("Pet Store", ["pets"]); // → "petStore"
 * groupNameOf("***", ["api", "users", "{id}"]); // → "users"
 * ```
 */
export function groupNameOf(label: string, shared: readonly string[]): string {
  if (toCamelCase(label) !== "") return toGroupName(label);
  const named = shared.filter((segment) => !isParameter(segment) && toCamelCase(segment) !== "");
  return toGroupName(named.at(-1) ?? label);
}

function isParameter(segment: string): boolean {
  return segment.startsWith("{") || segment.startsWith(":");
}
