import { formatDuration, formatTimestamp } from "@/components/shared/formatters";
import { MethodBadge } from "@/components/shared/method-badge";
import { useNow } from "@/hooks/use-tick";
import { buttonProps } from "@/lib/button-props";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import type { ActivityEntry } from "./compute-activity";

// ── Status dot config ───────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  success: "bg-emerald-400",
  error: "bg-rose-400",
  validation_error: "bg-amber-400",
  pending: "bg-zinc-400 animate-pulse",
};

// ── Component ───────────────────────────────────────────────────────────────

interface ActivityFeedProps {
  entries: ActivityEntry[];
  onSelectEntry?: (requestId: string) => void;
}

export function ActivityFeed({ entries, onSelectEntry }: ActivityFeedProps): React.ReactElement {
  if (entries.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-body-xs text-muted-foreground/60">
        No requests yet
      </div>
    );
  }

  return (
    <div className="space-y-0.5 max-h-80 overflow-y-auto pr-1 scrollbar-thin">
      {entries.map((entry) => (
        <FeedRow
          key={entry.id}
          entry={entry}
          onSelect={onSelectEntry ? () => onSelectEntry(entry.id) : undefined}
        />
      ))}
    </div>
  );
}

// ── Feed row ────────────────────────────────────────────────────────────────

function FeedRow({
  entry,
  onSelect,
}: {
  entry: ActivityEntry;
  onSelect?: (() => void) | undefined;
}): React.ReactElement {
  const timestampFormat = useStudioStore((s) => s.settings.timestampFormat);
  const now = useNow();
  const dotClass = STATUS_DOT[entry.status] ?? STATUS_DOT.error;

  return (
    <div
      {...(onSelect ? buttonProps(onSelect) : {})}
      className="flex items-center gap-2 rounded-md px-2 py-1 text-body-xs transition-colors hover:bg-muted/20 cursor-pointer"
    >
      {/* Status dot */}
      <span className={cn("size-1.5 shrink-0 rounded-full", dotClass)} />

      {/* Time */}
      <span className="w-18 shrink-0 tabular-nums text-muted-foreground/60 text-mono-xs">
        {formatTimestamp(entry.timestamp, timestampFormat, now)}
      </span>

      {/* HTTP method */}
      <MethodBadge method={entry.httpMethod} className="text-[9px]" />

      {/* Endpoint */}
      <span className="flex-1 truncate font-medium text-foreground/80">
        {entry.group ? `${entry.group}.` : ""}
        {entry.method}
      </span>

      {/* Duration */}
      <span className={cn("shrink-0 tabular-nums text-mono-xs", durationColor(entry.duration))}>
        {formatDuration(entry.duration)}
      </span>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function durationColor(ms: number): string {
  if (ms < 200) return "text-emerald-400/80";
  if (ms < 500) return "text-amber-400/80";
  return "text-rose-400/80";
}
