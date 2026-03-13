import { Timer } from "lucide-react";

import { useDevToolsStore } from "../store";
import { useSessionTimer } from "./use-session-timer";
import { THEME_ICONS, THEME_CYCLE } from "../app-config";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

// ── Connection indicator ────────────────────────────────────────────────────

function ConnectionDot({ status }: { status: string }) {
  const color =
    status === "connected"
      ? "bg-emerald-500"
      : status === "reconnecting"
        ? "bg-amber-500 animate-pulse-dot"
        : "bg-zinc-600";

  return <div className={`size-2 shrink-0 rounded-full ${color}`} />;
}

function connectionLabel(status: string, sessionCount: number): string {
  if (status === "connected") {
    return sessionCount > 0
      ? `${sessionCount} app${sessionCount > 1 ? "s" : ""}`
      : "Waiting\u2026";
  }
  return status === "reconnecting" ? "Reconnecting\u2026" : "Disconnected";
}

// ── Footer Content ──────────────────────────────────────────────────────────

export function SidebarFooterContent() {
  const {
    theme, setTheme,
    connectionStatus, sessions,
    sessionStartedAt,
  } = useDevToolsStore();
  const sessionTime = useSessionTimer(sessionStartedAt);

  function nextTheme() {
    const idx = THEME_CYCLE.indexOf(theme);
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]!);
  }

  const ThemeIcon = THEME_ICONS[theme];
  const connLabel = connectionLabel(connectionStatus, sessions.length);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton onClick={nextTheme} tooltip={`Theme: ${theme}`}>
          <ThemeIcon />
          <span>{theme[0]!.toUpperCase() + theme.slice(1)}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>

      <SidebarMenuItem>
        <SidebarMenuButton tooltip={connLabel} className="pointer-events-none">
          <ConnectionDot status={connectionStatus} />
          <span className="truncate">{connLabel}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>

      {sessionTime && (
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip={`Session: ${sessionTime}`}
            className="pointer-events-none text-muted-foreground"
          >
            <Timer className="size-4" />
            <span>{sessionTime}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )}
    </SidebarMenu>
  );
}
