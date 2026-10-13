import * as vscode from "vscode";
import { logFailure } from "../log/courier-log";
import type { StudioTarget } from "../projects/studio-targets";
import { StudioTokenRefusal } from "../studio/studio-token-refusal";
import type { CallSite, EndpointStats } from "../studio/studio-types";
import { treeItemOf } from "./tree-items";
import {
  type CourierNode,
  type EndpointNode,
  groupChildren,
  rootNodes,
  siteNodes,
  sourceNodes,
} from "./tree-nodes";

/** What the Courier view's rows are read from. */
export interface EndpointTreeSources {
  /** The Studios to show, as last found */
  targets(): Promise<readonly StudioTarget[]>;
  statsFor(studio: string): readonly EndpointStats[] | undefined;
  fetchSites(studio: string, source: string, endpoint: string): Promise<CallSite[]>;
}

/** The rows of the Courier view. */
export interface EndpointTree extends vscode.TreeDataProvider<CourierNode> {
  /** Draw the rows again: a Studio started or stopped, or its figures moved */
  refreshed(): void;
}

/* Studio reads only the files that changed to answer, yet each redraw asks for every open endpoint's calls. */
const SITES_FRESH_MS = 10_000;

/**
 * The rows of the Courier view: each project's Studio, its sources, the
 * groups their calls name and the endpoints — how their calls went — and,
 * under an endpoint, each place the project's code calls it.
 *
 * @param sources - What the rows are read from
 * @returns The tree's data provider
 * @example
 * ```ts
 * const tree = createEndpointTree({ targets, statsFor: store.statsFor, fetchSites });
 * vscode.window.createTreeView("courier.endpoints", { treeDataProvider: tree });
 * ```
 */
export function createEndpointTree(sources: EndpointTreeSources): EndpointTree {
  const changed = new vscode.EventEmitter<undefined>();
  const asked = new Map<string, { at: number; sites: Promise<CourierNode[]> }>();

  function sitesOf(node: EndpointNode): Promise<CourierNode[]> {
    const key = `${node.studio}\u0000${node.stats.source}\u0000${node.stats.endpoint}`;
    const known = asked.get(key);
    if (known && Date.now() - known.at < SITES_FRESH_MS) return known.sites;
    const sites = sources
      .fetchSites(node.studio, node.stats.source, node.stats.endpoint)
      .then((found) => siteNodes(node, found))
      .catch((error: unknown): CourierNode[] => {
        logFailure(`Studio at ${node.studio} did not list the call sites`, error);
        asked.delete(key);
        const id = `silent:${node.studio}:${node.stats.source}.${node.stats.endpoint}`;
        return [{ kind: "note", id, text: unlistedNote(error) }];
      });
    asked.set(key, { at: Date.now(), sites });
    return sites;
  }

  return {
    onDidChangeTreeData: changed.event,
    refreshed: () => changed.fire(undefined),
    getTreeItem: (node) => treeItemOf(node, Date.now()),
    async getChildren(node) {
      if (!node) return rootNodes(await sources.targets(), sources.statsFor);
      switch (node.kind) {
        case "project":
          return node.studio ? sourceNodes(node.studio, sources.statsFor(node.studio) ?? []) : [];
        case "source":
        case "group":
          return groupChildren(node);
        case "endpoint":
          return sitesOf(node);
        default:
          return [];
      }
    },
  };
}

/* Why the call sites are not listed: Studio refused for want of the token, or did not answer. */
function unlistedNote(error: unknown): string {
  return error instanceof StudioTokenRefusal
    ? "Courier Studio lists the call sites only with the project's token"
    : "Courier Studio did not answer";
}
