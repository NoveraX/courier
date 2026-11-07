import { rootsOf } from "./framework-roots";
import type { ImportGraph } from "./import-graph";
import { sideEdges } from "./side-edges";
import { type SideReach, spreadSide } from "./side-spread";
import { isToolConfig } from "./tool-configs";
import type { WorkspacePackages } from "./workspace-packages";

/** How far each side reaches a workspace's pieces of code. */
export interface SideReaches {
  /** 1 where a page's bundle has the piece for certain: a root of the page's, or imported from one. */
  readonly page: Uint8Array;
  /** Where a page's bundle may have it, and how. */
  readonly maybePage: SideReach;
  /** Where the server's code may run it, and how. */
  readonly maybeServer: SideReach;
  /** Where it runs it for certain, along the imports that name their files for it, and from which root. */
  readonly server: SideReach;
}

/* What a package with a server beside its page does not run as either: its tests, stories and mocks, and what it serves as it is. */
const NOT_RUN =
  /(?:^|\/)(?:__tests__|__mocks__|tests?|e2e|cypress|playwright)\/|\.(?:test|spec|stories|story)\.[^/]+$|^public\//;

/* Every piece reached from the seeds, each once, by the pieces each leads to. */
function spread(count: number, seeds: readonly number[], next: (id: number) => Iterable<number>) {
  const reached = new Uint8Array(count);
  const queue = [...seeds];
  for (const id of seeds) reached[id] = 1;
  for (let at = 0; at < queue.length; at++)
    for (const to of next(queue[at] ?? 0))
      if (reached[to] === 0) {
        reached[to] = 1;
        queue.push(to);
      }
  return reached;
}

/**
 * How far each side reaches a workspace's pieces of code, from the roots
 * its framework's rules give: each for certain, along the imports that
 * name their files for it, and each as it may, along every import that
 * may lead on and through what the graph could not read or follow. Beside a server framework, what no page's file reaches
 * — tests, stories and what is served as it is aside — is a root of the
 * server's; the server's roots are taken by their paths.
 *
 * @param graph - The workspace's graph of imports
 * @param packages - Its packages
 * @returns How far each side reaches
 * @example
 * ```ts
 * sideReaches(graph, packages).maybeServer.reached[3]; // 1
 * ```
 */
export function sideReaches(graph: ImportGraph, packages: WorkspacePackages): SideReaches {
  const { nodes, byFile, byPackage, unread } = graph;
  const roots = nodes.map((node) => rootsOf(node.framework, node.facts));
  const seeds = (pick: (id: number) => boolean) => nodes.flatMap((_, id) => (pick(id) ? [id] : []));
  const piecesOf = (...files: Array<readonly string[]>) =>
    files.flat().flatMap((file) => byFile.get(file) ?? []);
  const { toPage, toServer, unreadToPage, unreadToServer } = sideEdges(nodes, unread, byFile);
  type Kind = "page" | "server" | "split";
  const isRoot = (id: number, ...kinds: Kind[]) => kinds.some((kind) => roots[id]?.[kind] === true);
  const page = spread(
    nodes.length,
    seeds((id) => isRoot(id, "page")),
    (id) => toPage(nodes[id], piecesOf(nodes[id]?.files ?? [], nodes[id]?.pageFiles ?? [])),
  );
  /* What the graph could not read may load any piece of its package, and of the workspace's packages it lists. */
  const walked = {
    count: nodes.length,
    scopeOf: (at: number) => {
      const dir = unread[at]?.dir;
      return dir === undefined ? [] : [dir, ...packages.dependenciesOf(dir)];
    },
    piecesOf: (dir: string) => byPackage.get(dir) ?? [],
    packagesOf: (id: number) => nodes[id]?.packages ?? [],
  };
  const unreadRoots = (...kinds: Kind[]) =>
    unread.flatMap((node, at) => (kinds.some((kind) => node.roots[kind]) ? [at] : []));
  const maybePage = spreadSide({
    ...walked,
    roots: seeds((id) => isRoot(id, "page", "split")),
    unreadRoots: unreadRoots("page", "split"),
    next: (id) => {
      const node = nodes[id];
      if (node === undefined) return [];
      return toPage(node, piecesOf(node.files, node.pageFiles, node.loose, node.pageLoose));
    },
    unreadOf: (id) => unreadToPage(nodes[id]),
  });
  /* Beside a server framework, what no page's file reaches, and no rule of the page's framework names, is the server's. */
  const served = (id: number) => {
    const node = nodes[id];
    if (node?.framework.withServer !== true || isRoot(id, "page", "server", "split")) return false;
    return maybePage.direct[id] === 0 && !NOT_RUN.test(node.facts.path) && !isToolConfig(node.path);
  };
  /* The server's roots by their paths, so the first on the way to a piece is told the same on every system. */
  const byPath = (a: number, b: number) =>
    (nodes[a]?.path ?? "").localeCompare(nodes[b]?.path ?? "") || a - b;
  const serverRoots = seeds((id) => isRoot(id, "server", "split") || served(id)).sort(byPath);
  const maybeServer = spreadSide({
    ...walked,
    roots: serverRoots,
    unreadRoots: unreadRoots("server", "split"),
    next: (id) => {
      const node = nodes[id];
      if (node === undefined) return [];
      return toServer(node, piecesOf(node.files, node.serverFiles, node.loose, node.serverLoose));
    },
    unreadOf: (id) => unreadToServer(nodes[id]),
  });
  const server = spreadSide({
    ...walked,
    roots: serverRoots,
    unreadRoots: [],
    next: (id) => {
      const node = nodes[id];
      return node === undefined ? [] : toServer(node, piecesOf(node.files, node.serverFiles));
    },
    unreadOf: () => [],
    packagesOf: () => [],
  });
  return { page, maybePage, maybeServer, server };
}
