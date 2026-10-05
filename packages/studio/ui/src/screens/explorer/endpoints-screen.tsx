import { Server } from "lucide-react";
import { useRef } from "react";

import { SearchField } from "@/design/search-field";
import type { SegmentedOption } from "@/design/segmented";
import { Segmented } from "@/design/segmented";
import { endpointRows, kindCounts } from "@/features/explorer/endpoints-table";
import type { EndpointKind } from "@/features/explorer/explorer-search";
import { useElementWidth } from "@/hooks/use-element-width";
import { useFirstLoad } from "@/hooks/use-first-load";
import { useNow } from "@/hooks/use-tick";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import { EndpointRow } from "./endpoint-row";
import { ExplorerEmpty } from "./explorer-empty";
import { ExplorerSkeleton } from "./explorer-skeleton";
import { useExplorerModel } from "./use-explorer-model";
import { useExplorerSearch } from "./use-explorer-search";

/* Below this width the list drops its middleware and last-call columns. */
const WIDE_PX = 980;
const WIDE = "minmax(260px,2fr) minmax(120px,1fr) minmax(120px,1fr) 56px 72px 64px 80px";
const NARROW = "minmax(0,2fr) minmax(90px,1fr) 44px 64px 56px";
const HEAD = [
  { label: "Endpoint", wideOnly: false, right: false },
  { label: "Kind", wideOnly: false, right: false },
  { label: "Middleware", wideOnly: true, right: false },
  { label: "Calls", wideOnly: false, right: true },
  { label: "P95", wideOnly: false, right: true },
  { label: "Errors", wideOnly: false, right: true },
  { label: "Last call", wideOnly: true, right: true },
] as const;

const KIND_LABELS: Readonly<Record<EndpointKind, string>> = {
  all: "All",
  query: "Queries",
  mutation: "Mutations",
  stream: "Streams",
};

/**
 * The Explorer's list of endpoints under their sources — searchable, and
 * narrowed to queries, mutations or streams — with each one's kind,
 * middleware, calls, p95, error rate and last call; a row opens its panel.
 *
 * @returns The Endpoints tab
 * @example
 * ```tsx
 * <EndpointsScreen />
 * ```
 */
export function EndpointsScreen(): React.ReactNode {
  const model = useExplorerModel();
  const loading = useFirstLoad();
  const { q, kind, endpoint, set } = useExplorerSearch();
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  const now = useNow();
  const listRef = useRef<HTMLElement>(null);
  const wide = useElementWidth(listRef, 1200) >= WIDE_PX;
  if (!model.endpoints.length) {
    return loading.sources ? <ExplorerSkeleton view="endpoints" /> : <ExplorerEmpty />;
  }
  const rows = endpointRows(model, q, kind);
  const shown = rows.flatMap((row) => (row.kind === "endpoint" ? [row.endpoint] : []));
  const counts = kindCounts(model);
  const kinds: SegmentedOption<EndpointKind>[] = (
    ["all", "query", "mutation", "stream"] as const
  ).map((value) => ({
    value,
    label: KIND_LABELS[value],
    count: counts[value],
    countTone: "subtle",
  }));
  const columns = wide ? WIDE : NARROW;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2.5 border-b border-line bg-bg-subtle py-2.5 pr-4 pl-5">
        <SearchField
          value={q}
          onChange={(next) => set({ q: next })}
          placeholder="Search endpoints…"
          label="Search endpoints"
          className="w-70 max-w-full"
        />
        <Segmented
          label="Kind"
          options={kinds}
          value={kind}
          onChange={(next) => set({ kind: next })}
          quiet="subtle"
        />
        <div className="flex-1" />
        <span className="text-control text-fg-subtle">
          <span className="font-strong text-fg tabular-nums">{shown.length}</span>{" "}
          {shown.length === 1 ? "endpoint" : "endpoints"} ·{" "}
          {shown.filter((e) => !e.metrics.calls).length} never called
        </span>
      </div>
      <section ref={listRef} aria-label="Endpoints" className="min-h-0 flex-1 overflow-auto">
        <div
          aria-hidden="true"
          style={{ gridTemplateColumns: columns }}
          className="sticky top-0 z-[2] grid h-8.5 items-center gap-3 border-b border-line bg-bg px-5 text-label whitespace-nowrap text-fg-subtle"
        >
          {HEAD.filter((h) => wide || !h.wideOnly).map((h) => (
            <span key={h.label} className={cn(h.right && "text-right")}>
              {h.label}
            </span>
          ))}
        </div>
        {rows.length === 0 && (
          <p className="px-5 py-10 text-center text-control text-fg-subtle">No endpoints match</p>
        )}
        {rows.map((row) =>
          row.kind === "source" ? (
            <div
              key={`source:${row.source.name}`}
              className="flex h-8 items-center gap-2 border-b border-line bg-bg-subtle px-5 font-mono text-small font-semibold"
            >
              <Server aria-hidden="true" className="size-3 text-syntax-type" />
              {row.source.name}
              <span className="font-sans text-label font-normal text-fg-subtle">
                {row.source.baseURL}
              </span>
            </div>
          ) : (
            <EndpointRow
              key={row.endpoint.key}
              endpoint={row.endpoint}
              columns={columns}
              wide={wide}
              selected={endpoint === row.endpoint.key}
              now={now}
              slowMs={slowMs}
              onOpen={(key) => set({ endpoint: key })}
            />
          ),
        )}
      </section>
    </div>
  );
}
