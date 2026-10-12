import { useNavigate } from "@tanstack/react-router";

import { methodText } from "@/design/method-color";
import { cn } from "@/lib/utils";
import type { RequestEntry } from "@/store";
import { useStudioStore } from "@/store";
import { captureMetrics } from "./capture-metrics";

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");
const clock = (at: number): string => {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
};

function pathOf(request: RequestEntry): string {
  if (request.url) {
    try {
      return new URL(request.url, "http://studio.invalid").pathname;
    } catch {
      /* Not a URL: the endpoint's name stands for it. */
    }
  }
  return [request.group, request.method].filter(Boolean).join(".");
}

/* Narrower than its five columns allow, a row puts its method, endpoint and status on a line over
   its time and duration, and the column heads, which no longer line up, are left out. */
const ROW =
  "relative grid h-8.25 w-full cursor-pointer grid-cols-[78px_50px_minmax(0,1fr)_34px_84px] items-center gap-2.5 border-b border-line px-3.5 text-left transition-colors duration-400 hover:bg-raised @max-[25rem]:h-auto @max-[25rem]:grid-cols-[50px_minmax(0,1fr)_84px] @max-[25rem]:gap-y-1 @max-[25rem]:py-2";

function Row({ request, newest }: { request: RequestEntry; newest: boolean }): React.ReactNode {
  const navigate = useNavigate();
  const code = request.statusCode;
  const ms = request.timing?.total;
  const failed = code !== undefined && code >= 500;
  return (
    <button
      type="button"
      onClick={() => void navigate({ to: "/timeline", search: { req: request.id } })}
      className={cn(ROW, newest ? "bg-brand-tint" : failed && "bg-err-dim")}
    >
      <span
        aria-hidden="true"
        className={cn("absolute inset-y-0 left-0 w-0.5", newest ? "bg-brand" : failed && "bg-err")}
      />
      <span className="text-fg-subtle tabular-nums @max-[25rem]:col-span-2 @max-[25rem]:row-start-2">
        {clock(request.startedAt)}
      </span>
      <span className={cn("text-meta font-semibold", methodText(request.httpMethod ?? ""))}>
        {request.httpMethod ?? "—"}
      </span>
      <span className="flex min-w-0 gap-2 overflow-hidden whitespace-nowrap">
        <span className="text-fg">{request.source}</span>
        <span className="truncate text-fg-subtle">{pathOf(request)}</span>
      </span>
      <span
        className={cn(
          "tabular-nums @max-[25rem]:text-right",
          code === undefined
            ? "text-fg-subtle"
            : code >= 500
              ? "text-err"
              : code >= 400
                ? "text-warn"
                : "text-ok",
        )}
      >
        {code ?? "—"}
      </span>
      <span className="flex items-center justify-end gap-1.75 @max-[25rem]:col-start-3 @max-[25rem]:row-start-2">
        <span className="flex h-0.75 flex-1 justify-end overflow-hidden rounded-[2px] bg-raised">
          {ms !== undefined && (
            <span
              style={{ width: `${Math.min(100, Math.max(4, ms / 7))}%` }}
              className={cn(
                "h-full rounded-[2px]",
                ms > 400 ? "bg-warn" : failed ? "bg-err" : "bg-brand",
              )}
            />
          )}
        </span>
        <span className="min-w-9.5 text-right text-fg-muted tabular-nums">
          {ms === undefined ? "…" : `${Math.round(ms)}ms`}
        </span>
      </span>
    </button>
  );
}

/**
 * The capture panel once requests arrive: four numbers, then the latest
 * ten calls — each opens in the Timeline. A panel as narrow as a phone's
 * sets the numbers two by two and each call on two lines.
 *
 * @returns The panel's body
 * @example
 * ```tsx
 * <CaptureStream />
 * ```
 */
export function CaptureStream(): React.ReactNode {
  const requests = useStudioStore((s) => s.requests);
  const tick = useStudioStore((s) => s.clientTick);
  const live = useStudioStore((s) => s.connected && !s.paused);
  const metrics = captureMetrics(requests, tick >= 0 ? Date.now() : 0);
  const cells = [
    { label: "Requests", value: String(metrics.count), tone: "text-fg" },
    { label: "Req / s", value: metrics.perSecond.toFixed(1), tone: "text-fg" },
    {
      label: "p95",
      value: metrics.p95 === null ? "—" : `${Math.round(metrics.p95)}ms`,
      tone: metrics.p95 !== null && metrics.p95 > 400 ? "text-warn" : "text-fg",
    },
    {
      label: "Errors",
      value: `${metrics.errorRate.toFixed(1)}%`,
      tone: metrics.errorRate > 0 ? "text-err" : "text-fg",
    },
  ];
  return (
    <div
      className={cn(
        "@container flex flex-col transition-opacity duration-300",
        !live && "opacity-50",
      )}
    >
      <div className="grid grid-cols-4 border-b border-line @max-[25rem]:grid-cols-2">
        {cells.map((cell) => (
          <div
            key={cell.label}
            className="flex flex-col gap-1 border-r border-line px-3.5 py-3 last:border-r-0 @max-[25rem]:even:border-r-0 @max-[25rem]:[&:nth-child(-n+2)]:border-b"
          >
            <span className="font-mono text-micro tracking-[0.1em] text-fg-subtle uppercase">
              {cell.label}
            </span>
            <span
              className={cn(
                "font-mono text-metric font-medium tracking-[-0.02em] tabular-nums",
                cell.tone,
              )}
            >
              {cell.value}
            </span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[78px_50px_minmax(0,1fr)_34px_84px] gap-2.5 border-b border-line px-3.5 py-2 font-mono text-micro tracking-[0.08em] text-fg-subtle uppercase @max-[25rem]:hidden">
        <span>Time</span>
        <span>Method</span>
        <span>Source</span>
        <span>Code</span>
        <span className="text-right">Duration</span>
      </div>
      <div className="flex flex-col font-mono text-label">
        {requests.slice(0, 10).map((request, index) => (
          <Row key={request.id} request={request} newest={index === 0 && live} />
        ))}
      </div>
    </div>
  );
}
