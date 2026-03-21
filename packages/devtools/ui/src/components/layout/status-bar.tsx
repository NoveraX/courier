import { cn } from "@/lib/utils";
import { useDevToolsStore } from "@/store";
import { useElapsed } from "@/hooks/use-tick";

export function StatusBar(): React.ReactNode {
  const requests = useDevToolsStore((s) => s.requests);
  const paused = useDevToolsStore((s) => s.paused);
  const connectionStatus = useDevToolsStore((s) => s.connectionStatus);
  const sessions = useDevToolsStore((s) => s.sessions);
  const droppedRequests = useDevToolsStore((s) => s.droppedRequests);
  const sessionStartedAt = useDevToolsStore((s) => s.sessionStartedAt);
  const elapsed = useElapsed(sessionStartedAt, connectionStatus === "connected");

  const connected = connectionStatus === "connected";
  const reconnecting = connectionStatus === "reconnecting";

  const errors = requests.filter((r) => r.status === "error").length;
  const pending = requests.filter((r) => r.status === "pending").length;

  // Browser companion sessions (framework "unknown") are not separate apps
  const appCount = sessions.filter((s) => s.framework !== "unknown").length
    || (sessions.length > 0 ? 1 : 0);

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
            ? `${appCount} ${appCount === 1 ? "app" : "apps"}`
            : reconnecting
              ? "reconnecting..."
              : "disconnected"}
        </span>
        {connected && elapsed && (
          <span className="opacity-60">{elapsed}</span>
        )}
      </div>

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
        {paused && <span className="font-medium text-warning-foreground">REC PAUSED</span>}
      </div>

      {/* Right: branding */}
      <div className="flex h-full items-center px-2.5 text-muted-foreground/40">
        nexus
      </div>
    </footer>
  );
}
