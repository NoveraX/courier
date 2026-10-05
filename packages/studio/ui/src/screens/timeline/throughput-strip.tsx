import { durationTone } from "@/features/requests/duration-tone";
import { liveKpis, throughputBars } from "@/features/requests/throughput";
import { shownNow } from "@/features/sessions/shown-now";
import { useNow } from "@/hooks/use-tick";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";

const DURATION_TEXT = { normal: "text-fg", warn: "text-warn", err: "text-err" } as const;

/**
 * The last minute over the Timeline: a bar a second — what failed on top —
 * and the requests a minute, the p95, the error rate and the streams open.
 * A saved session's last minute is the minute before it ended.
 *
 * @returns The strip
 * @example
 * ```tsx
 * <ThroughputStrip />
 * ```
 */
export function ThroughputStrip(): React.ReactNode {
  const clock = useNow();
  const requests = useStudioStore((s) => s.requests);
  const saved = useStudioStore((s) => s.shownSession !== null);
  const now = shownNow(requests, clock, saved);
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  const bars = throughputBars(requests, now);
  const kpis = liveKpis(requests, now);
  const top = Math.max(3, ...bars.map((b) => b.ok + b.failed));
  const kpiList = [
    { label: "Req / min", value: String(kpis.perMinute), tone: "text-fg" },
    {
      label: "p95",
      value: kpis.p95 === null ? "—" : formatDuration(kpis.p95),
      tone: kpis.p95 === null ? "text-fg" : DURATION_TEXT[durationTone(kpis.p95, slowMs)],
    },
    {
      label: "Error rate",
      value: `${(kpis.errorRate * 100).toFixed(1)}%`,
      tone: kpis.errorRate > 0 ? "text-err" : "text-fg",
    },
    {
      label: "Live streams",
      value: String(kpis.liveStreams),
      tone: kpis.liveStreams > 0 ? "text-brand" : "text-fg",
    },
  ];
  return (
    <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-6 border-b border-line pt-3 pr-4 pb-2.5 pl-5">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex h-10 items-end gap-0.5">
          {bars.map((bar, i) => (
            <div
              key={bar.secondsAgo}
              title={`${bar.secondsAgo}s ago · ${bar.ok + bar.failed} req`}
              className="flex h-full min-w-0 flex-1 flex-col justify-end gap-px"
            >
              <span
                className="block rounded-[1.5px] bg-err opacity-90"
                style={{ height: `${(bar.failed / top) * 100}%` }}
              />
              <span
                className={cn(
                  "block rounded-[1.5px] transition-[height] duration-300",
                  i === bars.length - 1 ? "bg-brand" : "bg-brand/55",
                )}
                style={{ height: `${(bar.ok / top) * 100}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between font-mono text-micro text-fg-subtle">
          <span>−60s</span>
          <span>−30s</span>
          <span>{saved ? "end" : "now"}</span>
        </div>
      </div>
      <dl className="m-0 flex gap-5.5 pb-4">
        {kpiList.map((kpi) => (
          <div key={kpi.label} className="flex flex-col items-end gap-0.75">
            <dt className="text-badge whitespace-nowrap text-fg-subtle">{kpi.label}</dt>
            <dd
              className={cn(
                "m-0 font-mono text-figure font-medium tracking-[-0.02em] tabular-nums",
                kpi.tone,
              )}
            >
              {kpi.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
