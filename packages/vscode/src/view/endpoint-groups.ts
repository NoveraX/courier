import type { EndpointStats } from "../studio/studio-types";

/** A group of a source's endpoints, as the client names them, with the groups inside it. */
export interface EndpointGroup {
  /** Its own name: `orders` */
  readonly name: string;
  /** Its names from the source down: `admin.orders` */
  readonly path: string;
  readonly groups: readonly EndpointGroup[];
  readonly endpoints: readonly EndpointStats[];
}

interface Building {
  name: string;
  path: string;
  groups: Map<string, Building>;
  endpoints: EndpointStats[];
}

/**
 * A source's endpoints as the tree of groups their calls name — `orders.place`
 * in the group `orders`, `admin.orders.list` two groups down, `health` at the
 * source itself — each group and endpoint in the order Studio lists them.
 *
 * @param stats - One source's endpoints
 * @returns The source's own group, holding the rest
 * @example
 * ```ts
 * groupEndpoints(stats).groups.map((g) => g.name); // ["products", "cart", "orders"]
 * ```
 */
export function groupEndpoints(stats: readonly EndpointStats[]): EndpointGroup {
  const root: Building = { name: "", path: "", groups: new Map(), endpoints: [] };
  for (const endpoint of stats) {
    const names = endpoint.endpoint.split(".");
    let group = root;
    for (const name of names.slice(0, -1)) {
      const path = group.path === "" ? name : `${group.path}.${name}`;
      let next = group.groups.get(name);
      if (!next) {
        next = { name, path, groups: new Map(), endpoints: [] };
        group.groups.set(name, next);
      }
      group = next;
    }
    group.endpoints.push(endpoint);
  }
  return built(root);
}

function built(group: Building): EndpointGroup {
  return {
    name: group.name,
    path: group.path,
    groups: [...group.groups.values()].map(built),
    endpoints: group.endpoints,
  };
}

/**
 * How a group's endpoints went, all of them, inner groups included: how
 * many there are, how many had a call fail, how many were called.
 *
 * @param group - The group
 * @returns Its counts
 * @example
 * ```ts
 * tallyOf(groupEndpoints(stats)); // { endpoints: 18, failing: 3, called: 15 }
 * ```
 */
export function tallyOf(group: EndpointGroup): {
  endpoints: number;
  failing: number;
  called: number;
} {
  let endpoints = group.endpoints.length;
  let failing = group.endpoints.filter((endpoint) => endpoint.failed > 0).length;
  let called = group.endpoints.filter((endpoint) => endpoint.calls > 0).length;
  for (const inner of group.groups) {
    const tally = tallyOf(inner);
    endpoints += tally.endpoints;
    failing += tally.failing;
    called += tally.called;
  }
  return { endpoints, failing, called };
}
