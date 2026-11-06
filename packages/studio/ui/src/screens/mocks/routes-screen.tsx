import { useNavigate, useSearch } from "@tanstack/react-router";
import { ListPlus } from "lucide-react";

import { SearchField } from "@/design/search-field";
import type { SegmentedOption } from "@/design/segmented";
import { Segmented } from "@/design/segmented";
import { endpointNameOf, leftToServer } from "@/features/mocks/left-to-server";
import type { MockRoutesSearch, RouteKind } from "@/features/mocks/routes-view";
import { filterRoutes, ROUTE_KINDS, routeKindCounts } from "@/features/mocks/routes-view";
import { inspectorOf } from "@/features/requests/inspector-of";
import { useFirstLoad } from "@/hooks/use-first-load";
import { useAddToMock } from "@/mocks/use-add-to-mock";
import { useStudioStore } from "@/store";
import { AddToMockDialog } from "./add-to-mock-dialog";
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
  const add = useAddToMock();
  if (!server) return loading ? <MocksSkeleton view="list" /> : <NoMockServers />;
  const left = leftToServer(server);
  const addToMock = (endpoints: readonly string[]) => add.open({ key: server.serverId, endpoints });
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
      {left.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 rounded-panel border border-line bg-panel px-3.5 py-2.5">
          <p className="m-0 min-w-0 flex-1 text-small text-fg-muted">
            {`${left.length} ${left.length === 1 ? "endpoint" : "endpoints"} of ${server.source ?? "its source"} ${left.length === 1 ? "goes" : "go"} to your server: ${server.name} does not list ${left.length === 1 ? "it" : "them"}.`}
          </p>
          <button
            type="button"
            onClick={() => addToMock(left)}
            className="flex h-7 cursor-pointer items-center gap-1.5 rounded-card border border-line px-2.5 text-small text-fg-muted hover:border-line-strong hover:text-fg pointer-coarse:h-10"
          >
            <ListPlus aria-hidden="true" className="size-3.25" />
            Add to mock
          </button>
        </div>
      )}
      <RoutesList
        routes={routes}
        open={search.open}
        serverUrl={server.url}
        slowMs={slowMs}
        onOpen={(open) => set({ open })}
        {...(left.length > 0 && { onAddToMock: (route) => addToMock([endpointNameOf(route)]) })}
      />
      <AddToMockDialog add={add} />
    </div>
  );
}
