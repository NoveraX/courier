import { History, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDuration } from "@/components/shared/formatters";

import { useDevToolsStore } from "@/store";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";

// ── Types ──────────────────────────────────────────────────────────────────

interface HistoryBarProps {
  activeId: string | null;
  onSelect: (entry: PlaygroundHistoryEntry) => void;
}

// ── Status helpers ─────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  pending: "bg-muted-foreground animate-pulse",
  success: "bg-emerald-500",
  error: "bg-rose-500",
};

const STATUS_CODE_COLOR: Record<string, string> = {
  success: "text-emerald-400/70",
  error: "text-rose-400/70",
  pending: "text-muted-foreground/50",
};

// ── Component ──────────────────────────────────────────────────────────────

export function HistoryBar({ activeId, onSelect }: HistoryBarProps): React.ReactElement | null {
  const history = useDevToolsStore((s) => s.playgroundHistory);
  const clearHistory = useDevToolsStore((s) => s.clearPlaygroundHistory);

  if (history.length === 0) return null;

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
            >
              <History className="size-3" />
              <span className="tabular-nums">{history.length}</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Request history</TooltipContent>
      </Tooltip>

      <PopoverContent
        align="end"
        side="bottom"
        className="w-72 p-0"
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
          <span className="text-caption text-muted-foreground">
            History ({history.length})
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Clear history"
                className="size-5 text-muted-foreground/50 hover:text-rose-400"
                onClick={clearHistory}
              >
                <Trash2 className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Clear history</TooltipContent>
          </Tooltip>
        </div>

        <ScrollArea className="max-h-64">
          <div className="flex flex-col py-1">
            {history.map((entry) => (
              <HistoryRow
                key={entry.id}
                entry={entry}
                active={entry.id === activeId}
                onSelect={onSelect}
              />
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

// ── History row ────────────────────────────────────────────────────────────

function HistoryRow({ entry, active, onSelect }: {
  entry: PlaygroundHistoryEntry;
  active: boolean;
  onSelect: (entry: PlaygroundHistoryEntry) => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 text-left transition-colors",
        "text-xs font-mono",
        active
          ? "bg-accent-brand/10 text-foreground"
          : "text-muted-foreground hover:bg-card",
      )}
    >
      <div className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[entry.status])} />

      {entry.statusCode && (
        <span className={cn("w-7 shrink-0 tabular-nums", STATUS_CODE_COLOR[entry.status])}>
          {entry.statusCode}
        </span>
      )}

      <span className={cn(
        "shrink-0 rounded px-1 py-px text-[9px] uppercase leading-none tracking-wide",
        entry.mode === "proxy"
          ? "bg-blue-500/15 text-blue-400"
          : "bg-amber-500/15 text-amber-400",
      )}>
        {entry.mode === "proxy" ? "prx" : "dir"}
      </span>

      <span className="min-w-0 flex-1 truncate">
        {entry.group}.{entry.method}
      </span>

      {entry.duration !== undefined && (
        <span className="shrink-0 tabular-nums text-muted-foreground/40">
          {formatDuration(entry.duration)}
        </span>
      )}
    </button>
  );
}
