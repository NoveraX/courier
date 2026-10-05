import { keyParts } from "@/features/explorer/endpoint-key";
import type { Heatmap } from "@/features/explorer/heatmap-model";
import { HEAT_INTERVALS } from "@/features/explorer/heatmap-model";
import { methodLabelOf } from "@/features/explorer/method-label";
import type { ColorMetric } from "@/features/explorer/metric-value";
import { cn } from "@/lib/utils";
import { axisMark, heatCellText, heatTotalText, TOTAL_LABEL } from "./heat-format";
import { methodClassOf } from "./method-class";

/* Every fifth span carries a time mark. */
const MARK_EVERY = 5;

interface HeatmapGridProps {
  heatmap: Heatmap;
  metric: ColorMetric;
  /** The step of the scale a value falls on, or `null` for none. */
  stepOf: (value: number | null) => number | null;
  fills: readonly string[];
  onOpen: (key: string) => void;
}

/**
 * The heatmap's grid: a time axis, then a row per endpoint — its name, a
 * cell per span and its figure over the session.
 *
 * @param props - The heatmap, its metric, its scale, and what opens an endpoint
 * @returns The grid
 * @example
 * ```tsx
 * <HeatmapGrid heatmap={heatmap} metric="latency" stepOf={step} fills={fills} onOpen={open} />
 * ```
 */
export function HeatmapGrid(props: HeatmapGridProps): React.ReactNode {
  const { heatmap, metric, stepOf, fills, onOpen } = props;
  const span = heatmap.intervalMs * HEAT_INTERVALS;
  return (
    <div className="grid min-w-150 grid-cols-[minmax(200px,260px)_repeat(20,minmax(12px,1fr))_60px] items-center gap-0.75">
      <span className="text-badge text-fg-subtle">Endpoint</span>
      {Array.from({ length: HEAT_INTERVALS }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: the spans are fixed positions on the axis
          key={i}
          className="text-center font-mono text-micro whitespace-nowrap text-fg-subtle"
        >
          {i % MARK_EVERY === 0 ? axisMark(span - i * heatmap.intervalMs) : ""}
        </span>
      ))}
      <span className="text-right text-badge text-fg-subtle">{TOTAL_LABEL[metric]}</span>
      {heatmap.rows.map(({ endpoint, cells, total }) => {
        const method = methodLabelOf(endpoint);
        const totalStep = metric === "traffic" ? null : stepOf(total);
        return [
          <button
            key={`${endpoint.key}:name`}
            type="button"
            onClick={() => onOpen(endpoint.key)}
            className="flex h-6.5 min-w-0 cursor-pointer items-center gap-2 overflow-hidden text-left font-mono text-label whitespace-nowrap hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
          >
            <span className={cn("w-9 shrink-0 text-micro font-semibold", methodClassOf(method))}>
              {method}
            </span>
            <span className="truncate">{keyParts(endpoint).rest}</span>
            <span className="shrink-0 text-micro text-fg-subtle">{endpoint.source}</span>
          </button>,
          ...cells.map((value, i) => {
            const step = stepOf(value);
            return (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: a cell is its span's position in the row
                key={`${endpoint.key}:${i}`}
                title={`${endpoint.key} · ${heatCellText(value, metric)}`}
                className={cn(
                  "h-6.5 rounded-chip border",
                  step === null ? "border-line" : cn("border-transparent", fills[step]),
                )}
              />
            );
          }),
          <span
            key={`${endpoint.key}:total`}
            className={cn(
              "text-right font-mono text-label tabular-nums",
              totalStep !== null && totalStep >= 2
                ? "text-err"
                : totalStep === 1
                  ? "text-warn"
                  : "text-fg-muted",
            )}
          >
            {heatTotalText(total, metric)}
          </span>,
        ];
      })}
    </div>
  );
}
