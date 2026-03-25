import { useMemo, useState } from "react";
import { ChevronDown, Clock, StopCircle, Zap } from "lucide-react";
import { motion } from "motion/react";
import { STAGGER_ITEM_VARIANTS } from "@/components/shared/stagger-list";
import { cn } from "@/lib/utils";
import { useMockStore } from "@/store/mock-slice";

import type { ExperimentEvent } from "@/store/mock-slice";

interface ExperimentHistoryProps {
  serverId: string;
}

const TYPE_STYLES: Record<ExperimentEvent["type"], { icon: React.ElementType; color: string; label: string }> = {
  started: { icon: Zap, color: "text-sky-400", label: "Started" },
  stopped: { icon: StopCircle, color: "text-emerald-400", label: "Stopped" },
  "auto-halted": { icon: Clock, color: "text-amber-400", label: "Auto-halted" },
};

function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

export function ExperimentHistory({ serverId }: ExperimentHistoryProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  // Selector returns the raw array (stable reference); filter runs only when it changes.
  // Calling .filter() inside the selector would create a new array on every call,
  // causing useSyncExternalStore to see a different snapshot every time → infinite loop.
  const allHistory = useMockStore((s) => s.experimentHistory);
  const history = useMemo(
    () => allHistory.filter((e) => e.serverId === serverId),
    [allHistory, serverId],
  );

  return (
    <div className="rounded-xl border border-border-subtle bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted/40 ring-1 ring-border-subtle">
          <Clock className="size-3.5 text-muted-foreground/50" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-body-sm font-semibold text-foreground">Experiment History</h3>
          <p className="text-body-xs text-muted-foreground/60">Audit trail of chaos experiments</p>
        </div>
        {history.length > 0 && (
          <span className="rounded-md bg-muted/50 px-1.5 py-0.5 text-caption text-muted-foreground/60">
            {history.length}
          </span>
        )}
        <ChevronDown className={cn("size-3.5 text-muted-foreground/40 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-border-subtle">
          {history.length === 0 ? (
            <p className="py-6 text-center text-body-xs text-muted-foreground/40">No experiments yet</p>
          ) : (
            <motion.div
              className="divide-y divide-border-subtle"
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.02 } } }}
            >
              {history.slice(0, 20).map((event) => {
                const style = TYPE_STYLES[event.type];
                const Icon = style.icon;
                return (
                  <motion.div key={event.id} variants={STAGGER_ITEM_VARIANTS} className="flex items-start gap-3 px-4 py-2.5">
                    <Icon className={cn("mt-0.5 size-3.5 shrink-0", style.color)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-body-xs font-medium text-foreground/80">
                          {style.label} · {event.mode}
                        </span>
                        {event.reason && (
                          <span className="truncate text-caption text-amber-400/70">{event.reason}</span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-3 text-caption text-muted-foreground/50">
                        <span>{timeAgo(event.timestamp)}</span>
                        {event.durationMs !== undefined && (
                          <span>Duration: {formatDuration(event.durationMs)}</span>
                        )}
                        {event.peakErrorRate !== undefined && (
                          <span className="text-rose-400/60">Peak err: {Math.round(event.peakErrorRate)}%</span>
                        )}
                        {event.peakP99 !== undefined && (
                          <span className="text-amber-400/60">Peak P99: {event.peakP99}ms</span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
