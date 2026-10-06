import { ChevronsLeft } from "lucide-react";

import { requestStateOf } from "@/features/requests/request-state";
import { streamEnd } from "@/features/requests/stream-activity";
import type { TimeWindow, TrackScale } from "@/features/waterfall/time-window";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { RequestEntry } from "@/store/types";
import { RowLabel } from "./row-label";

/* The newest messages a stream's bar marks; more would only blur together. */
const MAX_TICKS = 80;

export interface StreamBarRowProps {
  request: RequestEntry;
  window: TimeWindow;
  scale: TrackScale;
  labelPx: number;
  now: number;
  selected: boolean;
  onSelect: (id: string) => void;
}

function ticksOf(r: RequestEntry, from: number, to: number, scale: TrackScale) {
  const events = (r.streamEvents ?? []).filter((e) => e.timestamp >= from && e.timestamp <= to);
  return events.slice(-MAX_TICKS).map((e) => ({
    seq: e.seq,
    x: scale.toPx(e.timestamp),
    sent: r.transport === "ws" && e.eventType === "message",
  }));
}

/**
 * A stream's row in the Waterfall: how long it has been open across the
 * window, each message it carried marked where it arrived — those a
 * WebSocket sent apart from those it received — and how many it carried.
 *
 * @param props - The stream, the window and scale, and what selecting does
 * @returns The row
 * @example
 * ```tsx
 * <StreamBarRow request={stream} window={window} scale={scale} labelPx={300} now={now} selected={false} onSelect={open} />
 * ```
 */
export function StreamBarRow(props: StreamBarRowProps): React.ReactNode {
  const { request: r, window, scale, labelPx, now, selected, onSelect } = props;
  const state = requestStateOf(r);
  const live = state === "streaming";
  const ws = r.transport === "ws";
  const end = streamEnd(r, now);
  const from = Math.max(r.startedAt, window.start);
  const to = Math.min(end, window.end);
  const x = scale.toPx(from);
  const width = Math.max(4, scale.toPx(to) - x);
  return (
    <button
      type="button"
      data-request-id={r.id}
      aria-pressed={selected}
      onClick={() => onSelect(r.id)}
      className={cn(
        "relative z-1 flex h-8 w-full cursor-pointer border-b border-line text-left transition-colors",
        selected ? "bg-brand-dim" : "hover:bg-brand-tint",
      )}
    >
      <RowLabel
        request={r}
        method={ws ? "WS" : "SSE"}
        methodClass={ws ? "text-syntax-keyword" : "text-brand"}
        duration={live ? "live" : formatDuration(end - r.startedAt)}
        durationClass={live ? "text-brand" : "text-fg-muted"}
        width={labelPx}
        indent
        selected={selected}
        failed={false}
      />
      <span className="relative block shrink-0" style={{ width: scale.trackPx }}>
        <span
          style={{ left: x, width }}
          className={cn(
            "absolute top-2.25 h-3.5 rounded-chip",
            ws
              ? "bg-syntax-keyword/10 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-syntax-keyword)_40%,transparent)]"
              : "bg-brand/10 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-brand)_40%,transparent)]",
          )}
        />
        {ticksOf(r, from, to, scale).map((tick) => (
          <span
            key={tick.seq}
            style={{ left: tick.x }}
            className={cn(
              "absolute top-2.75 h-2.5 w-0.5 rounded-[1px]",
              tick.sent || !ws ? "bg-brand" : "bg-ok",
            )}
          />
        ))}
        {r.startedAt < window.start && (
          <span className="absolute inset-y-0 left-0.5 flex items-center font-mono text-micro text-brand">
            <ChevronsLeft aria-hidden="true" className="size-2.75" />{" "}
            {formatDuration(now - r.startedAt)}
          </span>
        )}
        <span
          style={{ left: x + width }}
          className="pointer-events-none absolute inset-y-0 flex items-center gap-1.5 pl-2 font-mono text-meta whitespace-nowrap text-fg-subtle"
        >
          {r.streamEventCount ?? 0} msg
          {state === "error" && (
            <span className="flex h-4 items-center rounded-chip bg-err-dim px-1.25 text-micro font-semibold text-err">
              error
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
