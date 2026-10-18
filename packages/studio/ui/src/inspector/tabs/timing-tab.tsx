import { Link2, Minus, TrendingDown, TrendingUp } from "lucide-react";

import { TONE_TEXT } from "@/design/tone";
import { durationTone } from "@/features/requests/duration-tone";
import { endpointName } from "@/features/requests/request-parts";
import { endpointLatency } from "@/features/requests/throughput";
import type { TimingPhase } from "@/features/requests/timing-phases";
import { compareToP95, timeTicks, timingPhasesOf } from "@/features/requests/timing-phases";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import type { RequestEntry } from "@/store/types";
import { MiddlewarePipeline } from "./middleware-pipeline";
import { ProxyRoute } from "./proxy-route";

const PHASE_FILL: Readonly<Record<TimingPhase["key"], string>> = {
  "middleware-in": "bg-syntax-keyword",
  middleware: "bg-syntax-keyword",
  fetch: "bg-brand",
  validation: "bg-syntax-type",
  "middleware-out": "bg-syntax-keyword",
  overhead: "bg-fg-subtle",
  checks: "bg-syntax-type",
  handler: "bg-brand",
};

const TREND = {
  slower: { icon: TrendingUp, tone: "text-warn" },
  faster: { icon: TrendingDown, tone: "text-ok" },
  "in-line": { icon: Minus, tone: "text-ok" },
} as const;

/**
 * How a call spent its time: the total against its endpoint's p95, phase
 * by phase on one scale, the middleware chain step by step, and — for a
 * proxied call — the route it took. A call another call's request answered
 * is set against no p95: it says whose request it waited for. Where the
 * phases are narrow, as on a phone, each names itself over its bar, so the
 * bars keep the full width.
 *
 * @param props - The request
 * @returns The tab
 * @example
 * ```tsx
 * <TimingTab request={request} />
 * ```
 */
export function TimingTab({ request }: { request: RequestEntry }): React.ReactNode {
  const requests = useStudioStore((s) => s.requests);
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  const timing = timingPhasesOf(request);
  if (!timing) {
    return (
      <p className="m-0 px-4.5 py-9 text-center text-small text-fg-subtle">
        No timings yet: the request is still in flight.
      </p>
    );
  }
  const latency = request.shared ? null : endpointLatency(requests, request);
  const comparison = latency
    ? compareToP95(timing.total, latency, endpointName(request))
    : undefined;
  const owner = request.shared?.with;
  const waitedFor = owner === undefined ? undefined : requests.find((r) => r.id === owner);
  const tone = durationTone(timing.total, slowMs);
  const scale = Math.max(1, timing.total);
  return (
    <div className="flex flex-col gap-6 px-4.5 pt-5 pb-7">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-label text-fg-subtle">Total duration</span>
          <span
            className={cn(
              "font-mono text-hero leading-none font-medium tracking-[-0.035em]",
              TONE_TEXT[tone],
            )}
          >
            {formatDuration(timing.total)}
          </span>
        </div>
        {comparison && <Comparison {...comparison} />}
        {request.shared && <Waited owner={waitedFor} />}
      </div>
      <div className="@container overflow-hidden rounded-panel border border-line">
        <div className="grid h-7.5 grid-cols-[118px_minmax(0,1fr)_52px] items-center gap-3 border-b border-line bg-panel-subtle px-3 font-mono text-micro text-fg-subtle @max-[420px]:grid-cols-1">
          <span className="font-sans text-badge @max-[420px]:hidden">Phase</span>
          <span className="flex justify-between">
            {timeTicks(timing.total).map((tick, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: five fixed marks; two may read the same
              <span key={i}>{tick}</span>
            ))}
          </span>
          <span className="@max-[420px]:hidden" />
        </div>
        {timing.phases.map((phase) => (
          <div
            key={phase.key}
            className="grid h-9.5 grid-cols-[118px_minmax(0,1fr)_52px] items-center gap-3 border-b border-line px-3 last:border-b-0 @max-[420px]:h-auto @max-[420px]:grid-cols-[minmax(0,1fr)_auto] @max-[420px]:gap-y-1.5 @max-[420px]:py-2.5"
          >
            <span className="flex items-center gap-2 text-small whitespace-nowrap text-fg-muted">
              <span
                aria-hidden="true"
                className={cn("size-2 rounded-[2px]", PHASE_FILL[phase.key])}
              />
              {phase.label}
            </span>
            <span className="relative h-2.5 rounded-[3px] bg-[repeating-linear-gradient(90deg,var(--color-line)_0_1px,transparent_1px_25%)] @max-[420px]:col-span-2 @max-[420px]:row-start-2">
              <span
                className={cn("absolute inset-y-0 min-w-0.75 rounded-[3px]", PHASE_FILL[phase.key])}
                style={{
                  left: `${(phase.start / scale) * 100}%`,
                  width: `${(phase.duration / scale) * 100}%`,
                }}
              />
            </span>
            <span className="text-right font-mono text-label @max-[420px]:col-start-2 @max-[420px]:row-start-1">
              {formatDuration(phase.duration)}
            </span>
          </div>
        ))}
      </div>
      <MiddlewarePipeline request={request} />
      <ProxyRoute request={request} />
    </div>
  );
}

/* Whose request a call another call's request answered waited for. */
function Waited({ owner }: { owner: RequestEntry | undefined }): React.ReactNode {
  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <span className="flex items-center gap-1.25 text-small font-semibold text-fg-muted">
        <Link2 aria-hidden="true" className="size-3" />
        Shared
      </span>
      <span className="text-label text-fg-subtle">
        {owner
          ? `Waited for the request ${endpointName(owner)} sent`
          : "Waited for another call's request"}
      </span>
    </div>
  );
}

function Comparison({ label, trend, detail }: ReturnType<typeof compareToP95>): React.ReactNode {
  const { icon: Icon, tone } = TREND[trend];
  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <span className={cn("flex items-center gap-1.25 text-small font-semibold", tone)}>
        <Icon aria-hidden="true" className="size-3" />
        {label}
      </span>
      <span className="text-label text-fg-subtle">{detail}</span>
    </div>
  );
}
