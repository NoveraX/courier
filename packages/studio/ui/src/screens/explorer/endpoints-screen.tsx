import { useRef } from "react";

import { listTierOf } from "@/design/breakpoints";
import type { SegmentedOption } from "@/design/segmented";
import { endpointRows, kindCounts } from "@/features/explorer/endpoints-table";
import type { ExplorerModel } from "@/features/explorer/explorer-model";
import type { EndpointKind } from "@/features/explorer/explorer-search";
import { useElementWidth } from "@/hooks/use-element-width";
import { useFirstLoad } from "@/hooks/use-first-load";
import { useNow } from "@/hooks/use-tick";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import { EndpointList } from "./endpoint-list";
import { EndpointsBar } from "./endpoints-bar";
import { ExplorerEmpty } from "./explorer-empty";
import { ExplorerSkeleton } from "./explorer-skeleton";
import { useExplorerModel } from "./use-explorer-model";
import { useExplorerSearch } from "./use-explorer-search";

/* From this width the list shows its middleware and last-call columns. */
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

const HEAD_CLASS =
  "sticky top-0 z-[2] h-8.5 items-center border-b border-line bg-bg text-label whitespace-nowrap text-fg-subtle";

/**
 * The Explorer's list of endpoints under their sources — searchable, and
 * narrowed to queries, mutations or streams — with each one's kind,
 * middleware, calls, p95, error rate and last call; a row opens its panel.
 * A list too narrow for its columns, as on a phone, puts each endpoint on
 * two lines under a bar of one row.
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
  if (!model.endpoints.length) {
    return loading.sources ? <ExplorerSkeleton view="endpoints" /> : <ExplorerEmpty />;
  }
  return <EndpointsView model={model} />;
}

/* Mounted with its list, so the list is measured from the first frame it is drawn in. */
function EndpointsView({ model }: { model: ExplorerModel }): React.ReactNode {
  const { q, kind, endpoint, set } = useExplorerSearch();
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  const now = useNow();
  const listRef = useRef<HTMLElement>(null);
  const width = useElementWidth(listRef, typeof window === "undefined" ? 1200 : window.innerWidth);
  const tier = listTierOf(width, WIDE_PX);
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
  const summary = (
    <>
      <span className="font-strong text-fg tabular-nums">{shown.length}</span>{" "}
      {shown.length === 1 ? "endpoint" : "endpoints"} ·{" "}
      {shown.filter((e) => !e.metrics.calls).length} never called
    </>
  );
  const columns = tier === "wide" ? WIDE : NARROW;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <EndpointsBar
        q={q}
        onSearch={(next) => set({ q: next })}
        kinds={kinds}
        kind={kind}
        onKind={(next) => set({ kind: next })}
        summary={summary}
        compact={tier === "stacked"}
      />
      <section ref={listRef} aria-label="Endpoints" className="min-h-0 flex-1 overflow-auto">
        {tier === "stacked" ? (
          <p className={cn(HEAD_CLASS, "m-0 flex pr-4 pl-5 text-control")}>
            <span>{summary}</span>
          </p>
        ) : (
          <div
            aria-hidden="true"
            style={{ gridTemplateColumns: columns }}
            className={cn(HEAD_CLASS, "grid gap-3 px-5")}
          >
            {HEAD.filter((h) => tier === "wide" || !h.wideOnly).map((h) => (
              <span key={h.label} className={cn(h.right && "text-right")}>
                {h.label}
              </span>
            ))}
          </div>
        )}
        {rows.length === 0 && (
          <p className="px-5 py-10 text-center text-control text-fg-subtle">No endpoints match</p>
        )}
        <EndpointList
          rows={rows}
          scroller={listRef}
          tier={tier}
          columns={columns}
          selected={endpoint}
          now={now}
          slowMs={slowMs}
          onOpen={(key) => set({ endpoint: key })}
        />
      </section>
    </div>
  );
}
