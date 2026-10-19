import { groupNameClaimer } from "../parser/group-name-claimer";
import { TOP_LEVEL } from "../parser/top-level";
import type { ParsedEndpoint, ParsedGroup, ParsedSpec } from "../parser/types";
import { uniqueEndpointNames } from "../parser/unique-endpoint-names";
import { convertPathParams, findCommonPrefix, toGroupName } from "../parser/utils";
import { pathGroupKey, sharedRoot } from "./path-group-key";

/** How an import groups its endpoints. */
export type GroupBy = "tag" | "path" | "single";

/** Where an endpoint of the specification is generated, and as what. */
export interface EndpointPlacement {
  /** The endpoint as the specification lists it. */
  source: ParsedEndpoint;
  /** The specification's group it is in. */
  sourceGroup: string;
  /** The group it is generated into, without its endpoints; {@link TOP_LEVEL} for the API itself. */
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
 * @param groupBy - By tag, as the specification groups them; by the first
 *   segment after those every path shares, versions and parameters passed
 *   over; or in no group at all. An endpoint with no tag, or with no such
 *   segment, sits in the API itself, as with `"single"` every endpoint does.
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
  if (groupBy === "single") return placedTop(all);
  return byPathSegment(all);
}

type Sourced = Pick<EndpointPlacement, "source" | "sourceGroup">;

const TOP: EndpointPlacement["group"] = { name: TOP_LEVEL, description: "", prefix: "" };

/* The API's own endpoints: each at its whole path, as there is no prefix to be under. */
function placedTop(items: Sourced[]): EndpointPlacement[] {
  return placedIn(TOP, items, "", (e) => convertPathParams(e.fullPath));
}

function byPathSegment(all: Sourced[]): EndpointPlacement[] {
  const root = sharedRoot(all.map((item) => item.source.fullPath));
  const top: Sourced[] = [];
  const bySegment = new Map<string, Sourced[]>();
  for (const item of all) {
    const segment = pathGroupKey(item.source.fullPath, root);
    if (segment === null) top.push(item);
    else bySegment.set(segment, [...(bySegment.get(segment) ?? []), item]);
  }
  const claim = groupNameClaimer();
  const grouped = [...bySegment].flatMap(([segment, items]) => {
    const prefix = findCommonPrefix(items.map((item) => item.source.fullPath));
    /* A URL segment is not an identifier: Twilio's `2010-04-01` became
       `20100401`, and `export const 20100401` does not parse. */
    const name = claim(toGroupName(segment));
    /* The URL the caller builds uses `:name`; leaving the specification's
       braces in put a literal `{AccountSid}` into the request. */
    const group = { name, description: "", prefix: convertPathParams(prefix) };
    return placedIn(group, items, prefix, (e) =>
      convertPathParams(e.fullPath.slice(prefix.length) || "/"),
    );
  });
  return top.length > 0 ? [...placedTop(top), ...grouped] : grouped;
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
