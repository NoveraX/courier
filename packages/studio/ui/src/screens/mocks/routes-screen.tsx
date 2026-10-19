import { useNavigate, useSearch } from "@tanstack/react-router";

import { SearchField } from "@/design/search-field";
import type { SegmentedOption } from "@/design/segmented";
import { Segmented } from "@/design/segmented";
import type { MockRoutesSearch, RouteKind } from "@/features/mocks/routes-view";
import { filterRoutes, ROUTE_KINDS, routeKindCounts } from "@/features/mocks/routes-view";
import { inspectorOf } from "@/features/requests/inspector-of";
import { useFirstLoad } from "@/hooks/use-first-load";
import { useStudioStore } from "@/store";
import { MocksSkeleton } from "./mocks-skeleton";
import { NoMockServers } from "./no-mock-servers";
import { RoutesList } from "./routes-list";
import { useMockServer } from "./use-mock-server";

const KIND_LABELS: Readonly<Record<RouteKind, string>> = {
  all: "All",
  auto: "Auto",
  override: "Override",
  scenario: "Scenario",
  upstream: "Your server",
  fixtures: "Recorded",
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
  if (!server) return loading ? <MocksSkeleton view="list" /> : <NoMockServers />;
  const kind = search.kind ?? "all";
  const set = (patch: MockRoutesSearch) =>
    void navigate({
      search: (prev) => ({ ...inspectorOf(prev), ...search, ...patch }),
      replace: true,
    });
  const counts = routeKindCounts(server.routes);
  /* A mock that leaves nothing to its server, or replays nothing, has no use for those filters. */
  const shownKinds = ROUTE_KINDS.filter(
    (value) => (value !== "upstream" && value !== "fixtures") || counts[value] > 0,
  );
  const kinds: SegmentedOption<RouteKind>[] = shownKinds.map((value) => ({
    value,
    label: KIND_LABELS[value],
    count: counts[value],
    countTone: "subtle",
  }));
  const routes = filterRoutes(server.routes, search.q ?? "", kind);
  return (
    <div className="flex flex-col gap-3 px-5 pt-4 pb-8 max-sm:px-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchField
          value={search.q ?? ""}
          onChange={(q) => set({ q: q || undefined })}
          placeholder="Filter routes…"
          label="Filter routes"
          className="w-70 max-w-full max-sm:w-full"
        />
        <div className="scroll-row max-w-full min-w-0">
          <Segmented
            label="Handler"
            options={kinds}
            value={kind}
            onChange={(next) => set({ kind: next === "all" ? undefined : next })}
            quiet="subtle"
          />
        </div>
      </div>
      <RoutesList
        routes={routes}
        open={search.open}
        serverUrl={server.url}
        slowMs={slowMs}
        onOpen={(open) => set({ open })}
      />
    </div>
  );
}
