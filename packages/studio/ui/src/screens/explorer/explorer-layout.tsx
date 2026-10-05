import { Outlet } from "@tanstack/react-router";

import { EndpointPanel } from "./endpoint-panel";
import { ExplorerBar } from "./explorer-bar";

/**
 * The Explorer: the project's sources, groups and endpoints with what this
 * session did with them, as a graph, an overview, a list or a heatmap —
 * one tab at a time under a bar that switches them — and the panel of the
 * endpoint open, over whichever tab shows.
 *
 * @returns The Explorer
 * @example
 * ```tsx
 * <ExplorerLayout />
 * ```
 */
export function ExplorerLayout(): React.ReactNode {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ExplorerBar />
      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
      <EndpointPanel />
    </div>
  );
}
