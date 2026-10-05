import { useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import { methodText } from "@/design/method-color";
import { SearchField } from "@/design/search-field";
import type { SegmentedOption } from "@/design/segmented";
import { Segmented } from "@/design/segmented";
import type { MockRoutesSearch, RouteKind } from "@/features/mocks/routes-view";
import { filterRoutes, routeKeyOf, routeKindCounts } from "@/features/mocks/routes-view";
import { durationTone } from "@/features/requests/duration-tone";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import type { MockRouteEntry } from "@/store/mock-slice";
import { RouteDetail } from "./route-detail";
import { useMockServer } from "./use-mock-server";

const KIND_LABELS: Readonly<Record<RouteKind, string>> = {
  all: "All",
  auto: "Auto",
  override: "Override",
  scenario: "Scenario",
};
const KIND_TAG: Readonly<Record<MockRouteEntry["source"], string>> = {
  auto: "bg-raised text-fg-muted",
  override: "bg-warn-dim text-warn",
  scenario: "bg-syntax-keyword/12 text-syntax-keyword",
};
const AVG_TEXT = { normal: "text-fg", warn: "text-warn", err: "text-err" } as const;
const COLUMNS = "grid-cols-[minmax(0,1fr)_90px_70px_60px]";

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
  const search: MockRoutesSearch = useSearch({ from: "/mocks/routes" });
  const navigate = useNavigate({ from: "/mocks/routes" });
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  if (!server) return null;
  const kind = search.kind ?? "all";
  const set = (patch: MockRoutesSearch) =>
    void navigate({
      search: (prev) => ({ req: prev.req, tab: prev.tab, ...search, ...patch }),
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
            COLUMNS,
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
          const Caret = open ? ChevronDown : ChevronRight;
          return (
            <div key={key} className="border-b border-line last:border-b-0">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => set({ open: open ? undefined : key })}
                className={cn(
                  "grid min-h-10.5 w-full cursor-pointer items-center gap-3 px-4 py-1.5 text-left hover:bg-raised",
                  COLUMNS,
                  open && "bg-brand-tint",
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Caret aria-hidden="true" className="size-3 shrink-0 text-fg-subtle" />
                  <span
                    className={cn(
                      "w-11 shrink-0 font-mono text-meta font-semibold",
                      methodText(route.httpMethod.toUpperCase()),
                    )}
                  >
                    {route.httpMethod.toUpperCase()}
                  </span>
                  <span className="flex min-w-0 flex-col gap-px">
                    <span className="truncate font-mono text-control">{route.fullPath}</span>
                    <span className="font-mono text-meta text-fg-subtle">
                      {route.group}.{route.endpoint}
                    </span>
                  </span>
                </span>
                <span
                  className={cn(
                    "flex h-5 items-center justify-self-start rounded-[5px] px-1.75 text-badge font-strong",
                    KIND_TAG[route.source],
                  )}
                >
                  {route.source}
                </span>
                <span
                  className={cn(
                    "text-right font-mono text-small",
                    route.hits
                      ? AVG_TEXT[durationTone(route.avgLatency, slowMs)]
                      : "text-fg-subtle",
                  )}
                >
                  {!route.hits
                    ? "—"
                    : route.avgLatency >= 1
                      ? formatDuration(route.avgLatency)
                      : "<1ms"}
                </span>
                <span className="text-right font-mono text-small text-fg-muted tabular-nums">
                  {route.hits}
                </span>
              </button>
              {open && <RouteDetail route={route} serverUrl={server.url} />}
            </div>
          );
        })}
      </section>
    </div>
  );
}
