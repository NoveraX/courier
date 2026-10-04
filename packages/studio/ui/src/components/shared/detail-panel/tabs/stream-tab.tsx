import { ArrowDown, ArrowUp, ChevronRight, Radio } from "lucide-react";
import { useCallback, useState } from "react";
import { buttonProps } from "@/lib/button-props";
import { formatDuration, formatSize } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { RequestEntry, StreamEventRecord } from "@/store/types";
import { highlightLine } from "./syntax-highlight";

/** Stream events tab — shared between Timeline detail panel and Explorer */
export function StreamTab({ request }: { request: RequestEntry }): React.ReactElement {
  const events = request.streamEvents ?? [];
  const isActive = request.streamStatus === "streaming";
  const totalCount = Math.max(request.streamEventCount ?? 0, events.length);
  const totalBytes = request.streamTotalBytes ?? events.reduce((sum, e) => sum + e.dataSize, 0);
  const dropped = totalCount - events.length;

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8">
        {isActive && <Radio className="size-4 animate-pulse text-emerald-400" />}
        <p className="text-body-sm text-muted-foreground/60">
          {isActive ? "Waiting for events..." : "No stream events captured"}
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-px overflow-hidden p-3">
      <div className="mb-2 flex items-center gap-3 px-2 text-caption text-muted-foreground">
        <span className="tabular-nums">{totalCount} events</span>
        <span className="tabular-nums">{formatSize(totalBytes)}</span>
        {request.streamDuration != null && (
          <span className="tabular-nums">{formatDuration(request.streamDuration)}</span>
        )}
        <span className="flex-1" />
        {request.transport && request.transport !== "http" && (
          <span
            className={cn(
              "text-[10px] font-medium uppercase tracking-wider",
              request.transport === "ws" ? "text-sky-400" : "text-emerald-400",
            )}
          >
            {request.transport}
          </span>
        )}
        {isActive && (
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="size-1.5 animate-pulse rounded-full bg-current" />
            <span className="text-[10px] font-medium uppercase tracking-wider">live</span>
          </span>
        )}
        {request.streamStatus === "complete" && (
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
            complete
          </span>
        )}
        {request.streamStatus === "error" && (
          <span className="text-[10px] font-medium uppercase tracking-wider text-rose-400">
            error
          </span>
        )}
      </div>
      {dropped > 0 && (
        <div className="mb-1 px-2 text-caption text-muted-foreground/50">
          {dropped} earlier events trimmed
        </div>
      )}
      {events.map((evt) => (
        <EventRow key={evt.seq} event={evt} />
      ))}
    </div>
  );
}

function EventRow({ event }: { event: StreamEventRecord }): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);
  const hasPreview = !!event.dataPreview;

  return (
    <div
      className={cn(
        "group rounded-md px-2 py-1.5 transition-colors",
        hasPreview && "cursor-pointer hover:bg-muted/50",
      )}
      {...(hasPreview ? buttonProps(toggle) : {})}
    >
      <div className="flex min-w-0 items-center gap-2">
        {hasPreview ? (
          <ChevronRight
            className={cn(
              "size-3 shrink-0 text-muted-foreground/50 transition-transform duration-150",
              expanded && "rotate-90 text-muted-foreground",
            )}
          />
        ) : (
          <span className="size-3 shrink-0" />
        )}
        <span className="mono-xs w-7 shrink-0 text-right tabular-nums text-muted-foreground/60">
          {event.seq}
        </span>
        {event.eventType === "message" ? (
          <ArrowUp className="size-3 shrink-0 text-sky-400/70" />
        ) : event.eventType === "data" ? (
          <ArrowDown className="size-3 shrink-0 text-emerald-400/70" />
        ) : null}
        <span className="min-w-0 flex-1 truncate mono-xs text-foreground/70">
          {!expanded && event.dataPreview ? event.dataPreview : formatSize(event.dataSize)}
        </span>
        <span className="mono-xs shrink-0 tabular-nums text-muted-foreground/50">
          {formatTime(event.timestamp)}
        </span>
      </div>
      {expanded && event.dataPreview && (
        <div className="mt-1 ml-10.5 overflow-x-auto rounded-md border border-border-subtle/50 bg-zinc-950/60 p-2.5">
          <pre className="mono-xs leading-relaxed text-foreground/80">
            {highlightJson(event.dataPreview)}
          </pre>
        </div>
      )}
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function highlightJson(raw: string): React.ReactNode[] {
  const formatted = tryFormatJson(raw);
  return formatted.split("\n").flatMap((line, i, arr) => {
    const nodes = highlightLine(line, "json");
    return i < arr.length - 1 ? [...nodes, "\n"] : nodes;
  });
}

function tryFormatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
