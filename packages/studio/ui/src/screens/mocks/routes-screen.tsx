import { useNavigate, useSearch } from "@tanstack/react-router";

import { SearchField } from "@/design/search-field";
import type { SegmentedOption } from "@/design/segmented";
import { Segmented } from "@/design/segmented";
import type { MockRoutesSearch, RouteKind } from "@/features/mocks/routes-view";
import { filterRoutes, routeKeyOf, routeKindCounts } from "@/features/mocks/routes-view";
import { inspectorOf } from "@/features/requests/inspector-of";
import { useFirstLoad } from "@/hooks/use-first-load";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import { MocksSkeleton } from "./mocks-skeleton";
import { ROUTE_COLUMNS } from "./route-columns";
import { RouteRow } from "./route-row";
import { useMockServer } from "./use-mock-server";

const KIND_LABELS: Readonly<Record<RouteKind, string>> = {
  all: "All",
  auto: "Auto",
  override: "Override",
  scenario: "Scenario",
};

/**
 * The mock's routes: searched, narrowed to what answers them, each with its
 * method, path and endpoint, handler, average time and hits — opened for
 * what answers it, how to call it and a sample answer.
 *
 * @returns The Routes tab
 * @example
 * ```tsx
 * <MockRoutesScreen />
 * ```
 */
export function MockRoutesScreen(): React.ReactNode {
  const { server } = useMockServer();
  const first = useFirstLoad();
  const loading = first.requests || first.sources;
  const search: MockRoutesSearch = useSearch({ from: "/mocks/routes" });
  const navigate = useNavigate({ from: "/mocks/routes" });
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  if (!server) return loading ? <MocksSkeleton view="list" /> : null;
  const kind = search.kind ?? "all";
  const set = (patch: MockRoutesSearch) =>
    void navigate({
      search: (prev) => ({ ...inspectorOf(prev), ...search, ...patch }),
      replace: true,
    });
  const counts = routeKindCounts(server.routes);
  const kinds: SegmentedOption<RouteKind>[] = (
    ["all", "auto", "override", "scenario"] as const
  ).map((value) => ({
    value,
    label: KIND_LABELS[value],
    count: counts[value],
    countTone: "subtle",
  }));
  const routes = filterRoutes(server.routes, search.q ?? "", kind);
  return (
    <div className="flex flex-col gap-3 px-5 pt-4 pb-8">
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchField
          value={search.q ?? ""}
          onChange={(q) => set({ q: q || undefined })}
          placeholder="Filter routes…"
          label="Filter routes"
          className="w-70 max-w-full"
        />
        <Segmented
          label="Handler"
          options={kinds}
          value={kind}
          onChange={(next) => set({ kind: next === "all" ? undefined : next })}
          quiet="subtle"
        />
      </div>
      <section
        aria-label="Routes"
        className="overflow-hidden rounded-dialog border border-line bg-panel"
      >
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
        {routes.length === 0 && (
          <p className="px-4 py-8 text-center text-control text-fg-subtle">No routes match</p>
        )}
        {routes.map((route) => {
          const key = routeKeyOf(route);
          const open = search.open === key;
          return (
            <RouteRow
              key={key}
              route={route}
              open={open}
              serverUrl={server.url}
              slowMs={slowMs}
              onToggle={() => set({ open: open ? undefined : key })}
            />
          );
        })}
      </section>
    </div>
  );
}
