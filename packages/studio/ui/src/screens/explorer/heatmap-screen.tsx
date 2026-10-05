import { HEAT_INTERVALS, heatmapOf, heatStep } from "@/features/explorer/heatmap-model";
import { useFirstLoad } from "@/hooks/use-first-load";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import { ExplorerEmpty } from "./explorer-empty";
import { ExplorerSkeleton } from "./explorer-skeleton";
import { HEAT_FILLS } from "./heat-format";
import { HeatmapGrid } from "./heatmap-grid";
import { useExplorerModel } from "./use-explorer-model";
import { useExplorerSearch } from "./use-explorer-search";

/**
 * The Explorer's heatmap: every called HTTP endpoint across the session in
 * twenty spans, each coloured by the metric chosen — its p95, the share
 * that failed, how many calls or their size — with its figure over the
 * whole session at the end of its row.
 *
 * @returns The Heatmap tab
 * @example
 * ```tsx
 * <HeatmapScreen />
 * ```
 */
export function HeatmapScreen(): React.ReactNode {
  const model = useExplorerModel();
  const loading = useFirstLoad();
  const { metric, set } = useExplorerSearch();
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  if (!model.endpoints.length) {
    return loading.sources ? <ExplorerSkeleton view="heatmap" /> : <ExplorerEmpty />;
  }
  const heatmap = heatmapOf(model, metric);
  const fills = HEAT_FILLS[metric === "traffic" ? "traffic" : "health"];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3.5 border-b border-line bg-bg-subtle py-2.5 pr-4 pl-5">
        <span className="text-control text-fg-muted">
          {heatmap.rows.length} {heatmap.rows.length === 1 ? "endpoint" : "endpoints"} ×{" "}
          {HEAT_INTERVALS} intervals of {formatDuration(heatmap.intervalMs)}
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <span className="mr-1 text-badge text-fg-subtle">
            {metric === "traffic" ? "few" : "good"}
          </span>
          {fills.map((fill) => (
            <span key={fill} className={cn("h-2.5 w-5.5 rounded-[3px]", fill)} />
          ))}
          <span className="ml-1 text-badge text-fg-subtle">
            {metric === "traffic" ? "busy" : "bad"}
          </span>
          <span className="ml-3 flex items-center gap-1.25 text-badge text-fg-subtle">
            <span className="size-2.5 rounded-[3px] border border-line-strong" />
            no calls
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-5 pt-3.5 pb-7">
        {heatmap.rows.length === 0 ? (
          <p className="py-10 text-center text-control text-fg-subtle">
            No calls yet — each endpoint gets a row once it is called.
          </p>
        ) : (
          <HeatmapGrid
            heatmap={heatmap}
            metric={metric}
            stepOf={(value) => heatStep(value, metric, slowMs)}
            fills={fills}
            onOpen={(key) => set({ endpoint: key })}
          />
        )}
      </div>
    </div>
  );
}
