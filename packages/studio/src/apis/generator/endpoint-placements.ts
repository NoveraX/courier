import type { ParsedEndpoint, ParsedGroup, ParsedSpec } from "../parser/types";
import { uniqueEndpointNames } from "../parser/unique-endpoint-names";
import { convertPathParams, findCommonPrefix, toGroupName } from "../parser/utils";

/** The one group of an import generated with `groupBy: "single"`. */
export const SINGLE_GROUP = "api";

/** How an import groups its endpoints. */
export type GroupBy = "tag" | "path" | "single";

/** Where an endpoint of the specification is generated, and as what. */
export interface EndpointPlacement {
  /** The endpoint as the specification lists it. */
  source: ParsedEndpoint;
  /** The specification's group it is in. */
  sourceGroup: string;
  /** The group it is generated into, without its endpoints. */
  group: Omit<ParsedGroup, "endpoints">;
  /** The endpoint as it is generated: its name, and its path within the group. */
  endpoint: ParsedEndpoint;
}

/**
 * Place every endpoint of a specification in the group it is generated
 * into, under the name it is generated with. Names, group names and group
 * prefixes are decided over the whole specification, never over a
 * selection, so an endpoint is generated alike whichever others are
 * written with it — a later addition matches what is on disk.
 *
 * @param spec - The parsed specification
 * @param groupBy - By tag, as the specification groups them; by the first path segment; or all in one group
 * @returns One placement per endpoint, in generation order
 * @example
 * ```ts
 * placeEndpoints(spec, "single").map((p) => p.endpoint.name); // → ["getPetsById", "getStoreById"]
 * ```
 */
export function placeEndpoints(spec: ParsedSpec, groupBy: GroupBy): EndpointPlacement[] {
  const all = spec.groups.flatMap((group) =>
    group.endpoints.map((source) => ({ source, sourceGroup: group.name })),
  );
  if (groupBy === "tag") {
    return spec.groups.flatMap(({ endpoints, ...group }) =>
      endpoints.map((source) => ({ source, sourceGroup: group.name, group, endpoint: source })),
    );
  }
  if (groupBy === "single") {
    const group = { name: SINGLE_GROUP, description: "", prefix: "/" };
    return placedIn(group, all, "", (e) => convertPathParams(e.fullPath));
  }
  return byPathSegment(all);
}

type Sourced = Pick<EndpointPlacement, "source" | "sourceGroup">;

function byPathSegment(all: Sourced[]): EndpointPlacement[] {
  const bySegment = new Map<string, Sourced[]>();
  for (const item of all) {
    const segment = firstSegment(item.source.fullPath);
    bySegment.set(segment, [...(bySegment.get(segment) ?? []), item]);
  }
  const taken = new Set<string>();
  return [...bySegment].flatMap(([segment, items]) => {
    const prefix = findCommonPrefix(items.map((item) => item.source.fullPath));
    /* A URL segment is not an identifier: Twilio's `2010-04-01` became
       `20100401`, and `export const 20100401` does not parse. */
    const name = claim(toGroupName(segment), taken);
    /* The URL the caller builds uses `:name`; leaving the specification's
       braces in put a literal `{AccountSid}` into the request. */
    const group = { name, description: "", prefix: convertPathParams(prefix) };
    return placedIn(group, items, prefix, (e) =>
      convertPathParams(e.fullPath.slice(prefix.length) || "/"),
    );
  });
}

function placedIn(
  group: EndpointPlacement["group"],
  items: Sourced[],
  prefix: string,
  pathOf: (endpoint: ParsedEndpoint) => string,
): EndpointPlacement[] {
  const named = uniqueEndpointNames(
    items.map((item) => item.source),
    prefix,
  );
  return items.map((item, index) => {
    const endpoint = named[index] ?? item.source;
    return { ...item, group, endpoint: { ...endpoint, path: pathOf(item.source) } };
  });
}

function firstSegment(path: string): string {
  const segments = path.split("/").filter(Boolean);
  const first = segments[0] ?? "default";
  /* Skip path params — use second segment if available */
  if (first.startsWith("{") || first.startsWith(":")) {
    return segments[1] ?? "default";
  }
  return first;
}

/** Take a name, or the first numbered variant of it that is still free. */
function claim(name: string, taken: Set<string>): string {
  let candidate = name;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${name}${n}`;
    n += 1;
  }
  taken.add(candidate);
  return candidate;
}
