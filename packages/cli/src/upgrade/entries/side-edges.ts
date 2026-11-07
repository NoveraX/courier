import { keptOut, rendersOnly, takesReferencesOnly } from "./framework-roots";
import type { GraphNode } from "./import-graph";
import type { UnreadNode } from "./unread-nodes";

/** The imports each side follows from a piece of code. */
export interface SideEdges {
  /** Of the pieces an import leads to, those a page's bundle takes. */
  readonly toPage: (from: GraphNode | undefined, ids: readonly number[]) => number[];
  /** Of the pieces an import leads to, those the server's code runs. */
  readonly toServer: (from: GraphNode, ids: readonly number[]) => number[];
  /** The files and folders the graph could not read that a page's bundle takes from a piece. */
  readonly unreadToPage: (from: GraphNode | undefined) => number[];
  /** Those the server's code may run. */
  readonly unreadToServer: (from: GraphNode | undefined) => number[];
}

/**
 * The imports each side follows from a piece of code: a page's bundle
 * has no frontmatter, nor the code of a module of server functions it
 * takes references to, nor a server module React Router keeps out of it;
 * the server runs no Astro file's `<script>`, nor a component it only
 * renders, nor a client module. A file the graph could not read is not
 * known to be taken for its default alone.
 *
 * @param nodes - The graph's pieces
 * @param unread - The files and folders it could not read
 * @param byFile - Each file's pieces
 * @returns The filters
 * @example
 * ```ts
 * sideEdges(nodes, unread, byFile).toServer(page, [3, 4]); // [4], where 3 is a client component the page renders
 * ```
 */
export function sideEdges(
  nodes: readonly GraphNode[],
  unread: readonly UnreadNode[],
  byFile: ReadonlyMap<string, readonly number[]>,
): SideEdges {
  const directiveOf = (path: string) => nodes[byFile.get(path)?.[0] ?? -1]?.record.directive;
  return {
    toPage: (from, ids) =>
      ids.filter((id) => {
        const to = nodes[id];
        if (from === undefined || to === undefined || to.facts.kind === "frontmatter") return false;
        if (keptOut(from.framework.id, "page", to.facts.path)) return false;
        return !takesReferencesOnly(from.framework.id, to.record);
      }),
    toServer: (from, ids) =>
      ids.filter((id) => {
        const to = nodes[id];
        if (to === undefined || (to.facts.kind === "script" && to.path.endsWith(".astro")))
          return false;
        if (keptOut(from.framework.id, "server", to.facts.path)) return false;
        return !rendersOnly(from.framework.id, from.facts, {
          path: to.path,
          directive: directiveOf(to.path),
          defaultAlone: from.defaultAlone.has(to.path),
        });
      }),
    unreadToPage: (from) =>
      (from?.unread ?? []).filter((at) => {
        const to = unread[at];
        if (from === undefined || to === undefined) return false;
        if (keptOut(from.framework.id, "page", to.path)) return false;
        return !takesReferencesOnly(from.framework.id, to);
      }),
    unreadToServer: (from) =>
      (from?.unread ?? []).filter((at) => {
        const to = unread[at];
        if (from === undefined || to === undefined) return false;
        if (keptOut(from.framework.id, "server", to.path)) return false;
        const directive = to.directive === "unknown" ? undefined : to.directive;
        return !rendersOnly(from.framework.id, from.facts, {
          ...to,
          directive,
          defaultAlone: false,
        });
      }),
  };
}
