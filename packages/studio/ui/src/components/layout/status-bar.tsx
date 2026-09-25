import { AlertTriangle, Eye } from "lucide-react";

import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import { useElapsed } from "@/hooks/use-tick";
import { useMockStore } from "@/store/mock-slice";
import { StreamBadge } from "@/components/stream-badge";
import { WsBadge } from "@/components/ws-badge";
import { ConfigChip } from "./config-chip";

export function StatusBar(): React.ReactNode {
  const requests = useStudioStore((s) => s.requests);
  const paused = useStudioStore((s) => s.paused);
  const connectionStatus = useStudioStore((s) => s.connectionStatus);
  const bindingSnapshot = useStudioStore((s) => s.bindingSnapshot);
  const lastBindingError = useStudioStore((s) => s.lastBindingError);
  const droppedRequests = useStudioStore((s) => s.droppedRequests);
  const sessionStartedAt = useStudioStore((s) => s.sessionStartedAt);
  const watcherApiPaths = useStudioStore((s) => s.watcherApiPaths);
  const watcherMockFiles = useStudioStore((s) => s.watcherMockFiles);
  const elapsed = useElapsed(sessionStartedAt, connectionStatus === "connected");

  const totalWatched = watcherApiPaths + watcherMockFiles;
  const isRestarting = useMockStore((s) =>
    Object.values(s.servers).some((srv) => srv.processStatus === "restarting"),
  );

  const connected = connectionStatus === "connected";
  const reconnecting = connectionStatus === "reconnecting";

  const errors = requests.filter((r) => r.status === "error").length;
  const pending = requests.filter((r) => r.status === "pending").length;

  // Server-authoritative counts derived from the binding table — distinct
  // runtimes and distinct sources covered by `bound` rows.
  const runtimeCount = bindingSnapshot.runtimeCount;
  const sourceCount = bindingSnapshot.sourceCount;

  return (
    <footer className="flex h-6 shrink-0 items-center border-t border-border bg-background-inset text-[10px] tabular-nums select-none">
      {/* Left segment: connection — the ONLY connection indicator in the entire UI */}
      <div
        className={cn(
          "flex h-full items-center gap-1.5 px-2.5",
          connected && "bg-accent-brand/8 text-accent-brand",
          reconnecting && "bg-warning-muted text-warning-foreground",
          !connected && !reconnecting && "text-destructive-foreground",
        )}
      >
        <div
          className={cn(
            "size-1.5 rounded-full",
            connected && "bg-accent-brand",
            reconnecting && "bg-warning animate-pulse-dot",
            !connected && !reconnecting && "bg-destructive-foreground",
          )}
        />
        <span className="font-medium">
          {connected
            ? `${runtimeCount} ${runtimeCount === 1 ? "runtime" : "runtimes"} · ${sourceCount} ${sourceCount === 1 ? "source" : "sources"}`
            : reconnecting
              ? "reconnecting..."
              : "disconnected"}
        </span>
        {connected && elapsed && (
          <span className="opacity-60">{elapsed}</span>
        )}
      </div>

      {/* Watcher indicator */}
      {totalWatched > 0 && (
        <div className="flex h-full items-center gap-1.5 border-l border-border-subtle px-2.5 text-muted-foreground">
          <Eye className={cn("size-2.5", isRestarting ? "animate-pulse-dot text-amber-400" : "text-emerald-400")} />
          <span>{isRestarting ? "Reloading\u2026" : `Watching ${totalWatched}`}</span>
        </div>
      )}

      {/* Center: request telemetry */}
      <div className="flex h-full flex-1 items-center gap-3 px-3 text-muted-foreground">
        <span>{requests.length} req</span>
        {errors > 0 && <span className="text-destructive-foreground">{errors} err</span>}
        {pending > 0 && <span className="text-warning-foreground">{pending} pending</span>}
        {droppedRequests > 0 && (
          <span className="text-amber-400" title={`${droppedRequests} older requests dropped — increase limit in Settings`}>
            {droppedRequests} dropped
          </span>
        )}
        {lastBindingError && (
          <span
            role="status"
            aria-live="polite"
            aria-label={`Binding conflict on ${lastBindingError.details.sourceName} (${lastBindingError.details.transport}) — claimed by ${lastBindingError.details.runtimeIds.join(", ")}. Stop all but one runtime to resolve.`}
            title={`Binding conflict on ${lastBindingError.details.sourceName} (${lastBindingError.details.transport}) — claimed by ${lastBindingError.details.runtimeIds.join(", ")}`}
            className="inline-flex items-center gap-1 text-rose-400"
          >
            <AlertTriangle className="size-2.5" aria-hidden="true" />
            <span>binding conflict</span>
          </span>
        )}
        <ConfigChip />
        <StreamBadge />
        <WsBadge />
        {paused && <span className="font-medium text-warning-foreground">REC PAUSED</span>}
      </div>

      {/* Right: branding */}
      <div className="flex h-full items-center px-2.5 text-muted-foreground/40">
        courier
      </div>
    </footer>
  );
}
