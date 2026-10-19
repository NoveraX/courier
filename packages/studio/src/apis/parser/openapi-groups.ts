/**
 * The groups an OpenAPI specification's endpoints are generated in.
 */

import { groupNameClaimer } from "./group-name-claimer";
import { groupNameOf } from "./group-name-of";
import {
  gatheredPaths,
  joinSharedPaths,
  NO_PATHS,
  type SharedPath,
  sharedPrefix,
} from "./shared-path";
import type { ParsedEndpoint, ParsedGroup } from "./types";
import { uniqueEndpointNames } from "./unique-endpoint-names";
import { convertPathParams } from "./utils";

/**
 * Turn the endpoints of each tag into a group, a tag OpenAPI 3.2 nests
 * under another into a group inside that tag's group.
 *
 * A group is named after its tag, or after the last segment of the path its
 * endpoints share when the tag holds nothing a name is spelled with, and
 * gets a number when another group already took that name; a name over the
 * 128 characters a folder is named from is cut, its number included. Its prefix is the path its
 * endpoints — and those of every group inside it — share, after its parent
 * group's. A tag only other tags sit under becomes a group of its own, so
 * they have one to sit in.
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
  const subtrees = subtreePaths(tags, endpointsByTag, parents);
  const prefixes = new Map([...subtrees].map(([tag, shared]) => [tag, sharedPrefix(shared)]));
  const names = new Map<string, string>();
  const claim = groupNameClaimer();

  return tags.map((tag): ParsedGroup => {
    const prefix = prefixes.get(tag) ?? "/";
    const name = claim(groupNameOf(tag, subtrees.get(tag)?.segments ?? []));
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
  const placed = new Set<string>();
  for (const tag of withEndpoints) {
    const chain: string[] = [];
    for (
      let at: string | undefined = tag;
      at !== undefined && !placed.has(at);
      at = parents.get(at)
    ) {
      chain.push(at);
      placed.add(at);
    }
    for (const outer of chain.toReversed()) ordered.push(outer);
  }
  return ordered;
}

/*
 * The paths of each tag's endpoints and of every tag inside it. Each tag
 * comes after the tag it sits in, so walking them backwards settles a tag's
 * subtree before its parent's: every endpoint is read once, not once more
 * for each tag above it.
 */
function subtreePaths(
  tags: readonly string[],
  endpointsByTag: ReadonlyMap<string, ParsedEndpoint[]>,
  parents: ReadonlyMap<string, string>,
): Map<string, SharedPath> {
  const subtrees = new Map<string, SharedPath>();
  for (const tag of tags.toReversed()) {
    const own = gatheredPaths((endpointsByTag.get(tag) ?? []).map((e) => e.fullPath));
    const shared = joinSharedPaths(subtrees.get(tag) ?? NO_PATHS, own);
    subtrees.set(tag, shared);
    const parent = parents.get(tag);
    if (parent !== undefined) {
      subtrees.set(parent, joinSharedPaths(subtrees.get(parent) ?? NO_PATHS, shared));
    }
  }
  return subtrees;
}

/* A path after the path it extends: `/billing/invoices` within `/billing` is `invoices`. */
function within(path: string, outer: string): string {
  if (outer === "/" || !path.startsWith(outer)) return path;
  return path.slice(outer.length).replace(/^\//, "");
}
