/**
 * The groups an OpenAPI specification's endpoints are generated in.
 */

import type { ParsedEndpoint, ParsedGroup } from "./types";
import { uniqueEndpointNames } from "./unique-endpoint-names";
import { convertPathParams, findCommonPrefix, toGroupName } from "./utils";

/**
 * Turn the endpoints of each tag into a group, a tag OpenAPI 3.2 nests
 * under another into a group inside that tag's group.
 *
 * A group is named after its tag, or after the last segment of the path its
 * endpoints share when the tag makes no name, and gets a number when another
 * group already took that name. Its prefix is the path its endpoints — and
 * those of every group inside it — share, after its parent group's. A tag
 * only other tags sit under becomes a group of its own, so they have one to
 * sit in.
 *
 * @param endpointsByTag - Endpoints under the first tag each declares
 * @param tagDescriptions - The description the specification gives each tag
 * @param parents - The tag each nested tag sits under
 * @returns One group per tag, in the order the tags first appeared, a group
 *   before the groups inside it
 * @example
 * ```ts
 * buildGroups(new Map([["pets", [listPets, getPet]]]), new Map());
 * // → [{ name: "pets", prefix: "/pets", endpoints: [...] }]
 * ```
 */
export function buildGroups(
  endpointsByTag: Map<string, ParsedEndpoint[]>,
  tagDescriptions: Map<string, string>,
  parents: ReadonlyMap<string, string> = new Map(),
): ParsedGroup[] {
  const tags = tagsInOrder([...endpointsByTag.keys()], parents);
  const parentOf = (tag: string) => parents.get(tag);
  const below = (tag: string): string[] => tags.filter((t) => parentOf(t) === tag);
  const subtree = (tag: string): ParsedEndpoint[] => [
    ...(endpointsByTag.get(tag) ?? []),
    ...below(tag).flatMap(subtree),
  ];
  const prefixes = new Map(
    tags.map((tag) => [tag, findCommonPrefix(subtree(tag).map((e) => e.fullPath))]),
  );
  const names = new Map<string, string>();
  const usedNames = new Set<string>();

  return tags.map((tag): ParsedGroup => {
    const prefix = prefixes.get(tag) ?? "/";
    const name = deduplicateName(resolveGroupName(tag, prefix), usedNames);
    usedNames.add(name);
    names.set(tag, name);
    const parent = parentOf(tag);
    const endpoints = endpointsByTag.get(tag) ?? [];
    return {
      name,
      description: tagDescriptions.get(tag) ?? "",
      /* The URL the caller builds uses `:name`; leaving the specification's
         braces in put a literal `{AccountSid}` into the request. */
      prefix: convertPathParams(parent ? within(prefix, prefixes.get(parent) ?? "/") : prefix),
      ...(parent && { parent: names.get(parent) }),
      endpoints: uniqueEndpointNames(endpoints, prefix).map((e) => ({
        ...e,
        path: convertPathParams(e.fullPath.slice(prefix.length) || "/"),
      })),
    };
  });
}

/* Each tag with endpoints, each tag it sits under before it, in first-appearance order. */
function tagsInOrder(withEndpoints: string[], parents: ReadonlyMap<string, string>): string[] {
  const ordered: string[] = [];
  const add = (tag: string): void => {
    if (ordered.includes(tag)) return;
    const parent = parents.get(tag);
    if (parent !== undefined) add(parent);
    ordered.push(tag);
  };
  for (const tag of withEndpoints) add(tag);
  return ordered;
}

/* A path after the path it extends: `/billing/invoices` within `/billing` is `invoices`. */
function within(path: string, outer: string): string {
  if (outer === "/" || !path.startsWith(outer)) return path;
  return path.slice(outer.length).replace(/^\//, "");
}

function resolveGroupName(tag: string, prefix: string): string {
  const name = toGroupName(tag);
  if (name) return name;
  const lastSegment = prefix.split("/").filter(Boolean).pop();
  return lastSegment ? toGroupName(lastSegment) : "defaultGroup";
}

function deduplicateName(name: string, usedNames: Set<string>): string {
  if (!usedNames.has(name)) return name;
  let i = 2;
  while (usedNames.has(`${name}${i}`)) i++;
  return `${name}${i}`;
}
