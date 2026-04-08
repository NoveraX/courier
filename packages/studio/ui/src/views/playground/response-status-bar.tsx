import { Activity, Clock, Radio, Wifi } from "lucide-react";

import { formatDuration } from "@/components/shared/formatters";
import { cn } from "@/lib/utils";

import type { PlaygroundHistoryEntry } from "@/store/types-ui";

export function StatusBar({ entry }: { entry: PlaygroundHistoryEntry }): React.ReactElement {
  const isError = entry.status === "error";
  const isStream = entry.transport === "sse" || entry.transport === "ws";
  const isStreaming = entry.streamStatus === "streaming";
  const isComplete = entry.streamStatus === "complete";

  return (
    <div className="flex h-8 items-center gap-2 border-b border-border-subtle px-3">
      {/* Status pill */}
      <span className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        isError
          ? "bg-rose-500/10 text-rose-400"
          : isStreaming
            ? "bg-emerald-500/8 text-emerald-400"
            : isComplete
              ? "bg-zinc-500/10 text-muted-foreground"
              : "bg-zinc-500/10 text-muted-foreground",
      )}>
        {isStreaming && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
        {isStream ? streamLabel(entry) : httpLabel(entry)}
      </span>

      {/* Transport chip */}
      {isStream && entry.transport && (
        <span className={cn(
          "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium tracking-wide",
          entry.transport === "ws"
            ? "bg-sky-500/8 text-sky-400"
            : "bg-emerald-500/8 text-emerald-400",
        )}>
          {entry.transport === "ws" ? <Wifi className="size-2.5" /> : <Radio className="size-2.5" />}
          {entry.transport.toUpperCase()}
        </span>
      )}

      {/* Duration */}
      {entry.duration !== undefined && (
        <div className="flex items-center gap-1 text-caption tabular-nums text-muted-foreground/60">
          <Clock className="size-2.5" />
          {formatDuration(entry.duration)}
        </div>
      )}

      <div className="flex-1" />

      {/* Event counter for streams */}
      {isStream && entry.streamEventCount != null && entry.streamEventCount > 0 && (
        <div className="flex items-center gap-1 text-caption tabular-nums text-muted-foreground/50">
          <Activity className="size-2.5" />
          {entry.streamEventCount}
        </div>
      )}

      <span className="text-caption text-muted-foreground/40">
        {entry.group}.{entry.method}
      </span>
    </div>
  );
}

function streamLabel(entry: PlaygroundHistoryEntry): string {
  if (entry.streamStatus === "connecting") return "Connecting";
  if (entry.streamStatus === "streaming") return "Live";
  if (entry.streamStatus === "complete") return "Complete";
  if (entry.streamStatus === "error") return "Error";
  return "Pending";
}

function httpLabel(entry: PlaygroundHistoryEntry): string {
  if (entry.status === "pending") return "Pending";
  if (entry.status === "error") return entry.statusCode ? String(entry.statusCode) : "Error";
  return entry.statusCode ? String(entry.statusCode) : "OK";
}
