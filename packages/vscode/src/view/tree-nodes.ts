import type { CourierProject } from "../projects/courier-projects";
import type { StudioTarget } from "../projects/studio-targets";
import type { CallSite, EndpointStats } from "../studio/studio-types";
import { type EndpointGroup, groupEndpoints } from "./endpoint-groups";

/** A row of the Courier view. */
export type CourierNode =
  | {
      readonly kind: "project";
      readonly project: CourierProject;
      readonly studio?: string | undefined;
    }
  | {
      readonly kind: "source" | "group";
      readonly studio: string;
      readonly source: string;
      readonly group: EndpointGroup;
    }
  | { readonly kind: "endpoint"; readonly studio: string; readonly stats: EndpointStats }
  | {
      readonly kind: "site";
      readonly studio: string;
      readonly stats: EndpointStats;
      readonly site: CallSite;
    }
  | { readonly kind: "note"; readonly id: string; readonly text: string };

/** An endpoint's row in the Courier view. */
export type EndpointNode = Extract<CourierNode, { kind: "endpoint" }>;

/**
 * The view's first rows: nothing while no Studio answers — the view then
 * offers to start one — a single Studio's sources, or one row per project
 * of a monorepo, each holding its Studio's sources.
 *
 * @param targets - The Studios the view shows
 * @param statsFor - Every endpoint's stats as a Studio told them last
 * @returns The rows
 * @example
 * ```ts
 * rootNodes([{ project: shop, studio }], store.statsFor); // the shop's sources
 * ```
 */
export function rootNodes(
  targets: readonly StudioTarget[],
  statsFor: (studio: string) => readonly EndpointStats[] | undefined,
): CourierNode[] {
  if (!targets.some((target) => target.studio)) return [];
  const [only] = targets;
  if (targets.length === 1 && only?.studio)
    return sourceNodes(only.studio, statsFor(only.studio) ?? []);
  return targets.flatMap((target) =>
    target.project ? [{ kind: "project", project: target.project, studio: target.studio }] : [],
  );
}

/**
 * A Studio's sources, each holding the groups its calls name, in the order
 * Studio lists the endpoints.
 *
 * @param studio - Studio's address
 * @param stats - Every endpoint's stats
 * @returns One row per source
 * @example
 * ```ts
 * sourceNodes(studio, stats).map((node) => node.kind); // ["source", "source"]
 * ```
 */
export function sourceNodes(studio: string, stats: readonly EndpointStats[]): CourierNode[] {
  const bySource = new Map<string, EndpointStats[]>();
  for (const endpoint of stats) {
    const list = bySource.get(endpoint.source) ?? [];
    list.push(endpoint);
    bySource.set(endpoint.source, list);
  }
  return [...bySource].map(([source, endpoints]) => ({
    kind: "source",
    studio,
    source,
    group: groupEndpoints(endpoints),
  }));
}

/**
 * A source's or a group's rows: its groups first, then its own endpoints.
 *
 * @param node - The source or the group
 * @returns Its rows
 * @example
 * ```ts
 * groupChildren(node).map((child) => child.kind); // ["group", "endpoint"]
 * ```
 */
export function groupChildren(
  node: Extract<CourierNode, { kind: "source" | "group" }>,
): CourierNode[] {
  const { studio, source, group } = node;
  return [
    ...group.groups.map((inner): CourierNode => ({ kind: "group", studio, source, group: inner })),
    ...group.endpoints.map((stats): CourierNode => ({ kind: "endpoint", studio, stats })),
  ];
}

/**
 * An endpoint's rows: each place the project's code calls it, or a line
 * saying it calls it nowhere.
 *
 * @param node - The endpoint
 * @param sites - Where the code calls it
 * @returns Its rows
 * @example
 * ```ts
 * siteNodes(node, sites).map((child) => child.kind); // ["site", "site"]
 * ```
 */
export function siteNodes(node: EndpointNode, sites: readonly CallSite[]): CourierNode[] {
  const { studio, stats } = node;
  if (sites.length > 0) return sites.map((site) => ({ kind: "site", studio, stats, site }));
  const id = `note:${studio}:${stats.source}.${stats.endpoint}`;
  return [{ kind: "note", id, text: "No call to it in the project's code" }];
}
