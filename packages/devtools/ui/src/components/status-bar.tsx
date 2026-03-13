import { useNavigate } from "@tanstack/react-router";

import { useDevToolsStore } from "../store";
import { useSessionTimer } from "./use-session-timer";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

export function StatusBar() {
  const navigate = useNavigate();
  const {
    connectionStatus, sessions, requests, paused,
    settings, sessionStartedAt,
  } = useDevToolsStore();

  const sessionTime = useSessionTimer(sessionStartedAt);

  const errorCount = requests.filter(
    (r) => r.status === "error" || r.status === "validation_error",
  ).length;
  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const slowCount = requests.filter(
    (r) => r.timing?.total != null && r.timing.total > settings.slowRequestThreshold,
  ).length;

  const dotColor =
    connectionStatus === "connected"
      ? "bg-emerald-500"
      : connectionStatus === "reconnecting"
        ? "bg-amber-500 animate-pulse-dot"
        : "bg-zinc-600";

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-border bg-background px-3 text-[11px]">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void navigate({ to: "/settings" })}
          className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-accent"
        >
          <div className={`size-1.5 rounded-full ${dotColor}`} />
          <span className="text-muted-foreground">
            {connectionStatus === "connected"
              ? `${sessions.length} app${sessions.length !== 1 ? "s" : ""}`
              : connectionStatus === "reconnecting"
                ? "Reconnecting\u2026"
                : "Offline"}
          </span>
        </button>

        {paused && (
          <>
            <Separator orientation="vertical" className="h-3" />
            <Badge variant="outline" className="h-4 px-1 py-0 text-[10px] text-warning-foreground">
              Paused
            </Badge>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 text-muted-foreground">
        {sessionTime && <span title="Session duration">{sessionTime}</span>}
        <Separator orientation="vertical" className="h-3" />
        <span>{requests.length} requests</span>
        {errorCount > 0 && (
          <span className="text-destructive-foreground">
            {errorCount} error{errorCount > 1 ? "s" : ""}
          </span>
        )}
        {slowCount > 0 && (
          <span className="text-warning-foreground">{slowCount} slow</span>
        )}
        {pendingCount > 0 && (
          <span className="text-info-foreground">{pendingCount} pending</span>
        )}
      </div>
    </footer>
  );
}
