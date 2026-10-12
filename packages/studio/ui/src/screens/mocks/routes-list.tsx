import { useRef } from "react";

import { listTierOf, STACKED_BELOW } from "@/design/breakpoints";
import { routeKeyOf } from "@/features/mocks/routes-view";
import { useElementWidth } from "@/hooks/use-element-width";
import { cn } from "@/lib/utils";
import type { MockRouteEntry } from "@/store/mock-slice";
import { ROUTE_COLUMNS } from "./route-columns";
import { RouteRow } from "./route-row";

interface RoutesListProps {
  routes: readonly MockRouteEntry[];
  /** The key of the route open, if any. */
  open: string | undefined;
  serverUrl: string;
  slowMs: number;
  /** Opens a route by its key, or closes the one open. */
  onOpen: (key: string | undefined) => void;
}

/**
 * The mock's routes as a table — route, handler, average and hits — or, in
 * a list too narrow for the columns, each route on two lines under no
 * header: its method, path and handler over its endpoint, average and hits.
 *
 * @param props - The routes, the one open, the mock's address, the slow threshold, and what opens one
 * @returns The list
 * @example
 * ```tsx
 * <RoutesList routes={routes} open={search.open} serverUrl={server.url} slowMs={500} onOpen={open} />
 * ```
 */
export function RoutesList({
  routes,
  open,
  serverUrl,
  slowMs,
  onOpen,
}: RoutesListProps): React.ReactNode {
  const listRef = useRef<HTMLElement>(null);
  /* Until the list is measured the window's width stands in for it, so a phone never draws the columns first. */
  const width = useElementWidth(listRef, typeof window === "undefined" ? 0 : window.innerWidth);
  /* The rows have one layout of columns, from where they stop stacking. */
  const stacked = listTierOf(width, STACKED_BELOW) === "stacked";
  return (
    <section
      ref={listRef}
      aria-label="Routes"
      className="overflow-hidden rounded-dialog border border-line bg-panel"
    >
      {!stacked && (
        <div
          aria-hidden="true"
          className={cn(
            "grid h-8.5 items-center gap-3 border-b border-line bg-panel-subtle px-4 text-label text-fg-subtle",
            ROUTE_COLUMNS,
          )}
        >
          <span>Route</span>
          <span>Handler</span>
          <span className="text-right">Avg</span>
          <span className="text-right">Hits</span>
        </div>
      )}
      {routes.length === 0 && (
        <p className="px-4 py-8 text-center text-control text-fg-subtle">No routes match</p>
      )}
      {routes.map((route) => {
        const key = routeKeyOf(route);
        const isOpen = open === key;
        return (
          <RouteRow
            key={key}
            route={route}
            open={isOpen}
            stacked={stacked}
            serverUrl={serverUrl}
            slowMs={slowMs}
            onToggle={() => onOpen(isOpen ? undefined : key)}
          />
        );
      })}
    </section>
  );
}
