import type { Tone } from "@/design/tone";
import { TONE_TEXT } from "@/design/tone";
import type { EndpointNode } from "@/features/explorer/explorer-model";
import { formatDuration, formatSize } from "@/lib/formatters";
import { cn } from "@/lib/utils";

/**
 * An endpoint's four figures: its calls, p95, error rate and average size.
 *
 * @param props - The endpoint and the slow threshold
 * @returns The figures
 * @example
 * ```tsx
 * <EndpointFigures endpoint={endpoint} slowMs={500} />
 * ```
 */
export function EndpointFigures({
  endpoint,
  slowMs,
}: {
  endpoint: EndpointNode;
  slowMs: number;
}): React.ReactNode {
  const { calls, p95, errorRate, avgSize } = endpoint.metrics;
  const cells: { label: string; value: string; tone: Tone }[] = [
    { label: "Calls", value: String(calls), tone: "normal" },
    {
      label: "P95",
      value: p95 === null ? "—" : formatDuration(p95),
      tone: p95 === null ? "normal" : p95 > slowMs * 2 ? "err" : p95 > slowMs ? "warn" : "normal",
    },
    {
      label: "Errors",
      value: calls ? `${errorRate.toFixed(1)}%` : "—",
      tone: errorRate >= 5 ? "err" : "normal",
    },
    { label: "Avg size", value: avgSize ? formatSize(Math.round(avgSize)) : "—", tone: "normal" },
  ];
  return (
    <div className="grid grid-cols-4 gap-px overflow-hidden rounded-panel border border-line bg-line">
      {cells.map((cell) => (
        <div
          key={cell.label}
          className="flex min-w-0 flex-col gap-1 bg-inset px-2.75 pt-2.25 pb-2.5"
        >
          <span className="text-meta text-fg-subtle">{cell.label}</span>
          <span
            className={cn(
              "font-mono text-title font-medium whitespace-nowrap tabular-nums",
              TONE_TEXT[cell.tone],
            )}
          >
            {cell.value}
          </span>
        </div>
      ))}
    </div>
  );
}
