/**
 * The groups an OpenAPI specification's endpoints are generated in.
 */

import type { ParsedEndpoint, ParsedGroup } from "./types";
import { uniqueEndpointNames } from "./unique-endpoint-names";
import { convertPathParams, findCommonPrefix, toBindingName } from "./utils";

/**
 * Turn the endpoints of each tag into a group.
 *
 * A group is named after its tag, or after the last segment of the path its
 * endpoints share when the tag makes no name, and gets a number when another
 * group already took that name. Its prefix is the path its endpoints share.
 *
 * @param endpointsByTag - Endpoints under the first tag each declares
 * @param tagDescriptions - The description the specification gives each tag
 * @returns One group per tag, in the order the tags first appeared
 * @example
 * ```ts
 * buildGroups(new Map([["pets", [listPets, getPet]]]), new Map());
 * // → [{ name: "pets", prefix: "/pets", endpoints: [...] }]
 * ```
 */
export function buildGroups(
  endpointsByTag: Map<string, ParsedEndpoint[]>,
  tagDescriptions: Map<string, string>,
): ParsedGroup[] {
  const groups: ParsedGroup[] = [];
  const usedNames = new Set<string>();

  for (const [tag, endpoints] of endpointsByTag) {
    const prefix = findCommonPrefix(endpoints.map((e) => e.fullPath));
    const name = deduplicateName(resolveGroupName(tag, prefix), usedNames);
    usedNames.add(name);

    groups.push({
      name,
      description: tagDescriptions.get(tag) ?? "",
      /* The URL the caller builds uses `:name`; leaving the specification's
         braces in put a literal `{AccountSid}` into the request. */
      prefix: convertPathParams(prefix),
      endpoints: uniqueEndpointNames(endpoints, prefix).map((e) => ({
        ...e,
        path: convertPathParams(e.fullPath.slice(prefix.length) || "/"),
      })),
    });
  }
  return groups;
}

function resolveGroupName(tag: string, prefix: string): string {
  const name = toBindingName(tag);
  if (name) return name;
  const lastSegment = prefix.split("/").filter(Boolean).pop();
  return lastSegment ? toBindingName(lastSegment) : "defaultGroup";
}

function deduplicateName(name: string, usedNames: Set<string>): string {
  if (!usedNames.has(name)) return name;
  let i = 2;
  while (usedNames.has(`${name}${i}`)) i++;
  return `${name}${i}`;
}
