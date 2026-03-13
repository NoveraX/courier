import { useRouterState } from "@tanstack/react-router";
import { Pause, Play, Search, Trash2 } from "lucide-react";

import { SIDEBAR_GROUPS, SETTINGS_NAV } from "../app-config";
import { useDevToolsStore } from "../store";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ── Breadcrumb derivation ───────────────────────────────────────────────────

function useBreadcrumb(): { section?: string; page?: string; subPage?: string } {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  for (const group of SIDEBAR_GROUPS) {
    for (const item of group.items) {
      if (pathname === item.to || pathname.startsWith(item.to + "/")) {
        const sub = pathname.slice(item.to.length + 1);
        return { section: group.label, page: item.label, subPage: sub || undefined };
      }
    }
  }

  if (pathname.startsWith(SETTINGS_NAV.to)) {
    return { section: "System", page: SETTINGS_NAV.label };
  }

  return {};
}

// ── Connection pill ─────────────────────────────────────────────────────────

function ConnectionPill({ status, sessionCount }: { status: string; sessionCount: number }) {
  const dotColor =
    status === "connected"
      ? "bg-emerald-500"
      : status === "reconnecting"
        ? "bg-amber-500 animate-pulse-dot"
        : "bg-zinc-600";

  const label =
    status === "connected"
      ? sessionCount > 0
        ? `${sessionCount} app${sessionCount > 1 ? "s" : ""}`
        : "Waiting"
      : status === "reconnecting"
        ? "Reconnecting"
        : "Offline";

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
      <div className={`size-1.5 rounded-full ${dotColor}`} />
      <span>{label}</span>
    </div>
  );
}

// ── Top Bar ─────────────────────────────────────────────────────────────────

interface TopBarProps {
  onSearchClick: () => void;
}

export function TopBar({ onSearchClick }: TopBarProps) {
  const { section, page, subPage } = useBreadcrumb();
  const { paused, togglePaused, clearRequests, connectionStatus, sessions } =
    useDevToolsStore();

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-4" />

      <Breadcrumb>
        <BreadcrumbList className="gap-1.5 text-xs">
          {section && (
            <BreadcrumbItem>{section}</BreadcrumbItem>
          )}
          {section && page && <BreadcrumbSeparator />}
          {page && (
            <BreadcrumbItem>
              <BreadcrumbPage>{page}</BreadcrumbPage>
            </BreadcrumbItem>
          )}
          {subPage && <BreadcrumbSeparator />}
          {subPage && (
            <BreadcrumbItem>
              <BreadcrumbPage className="capitalize">{subPage}</BreadcrumbPage>
            </BreadcrumbItem>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => togglePaused()}
              className="size-7"
            >
              {paused ? <Play size={14} /> : <Pause size={14} />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{paused ? "Resume (⌘P)" : "Pause (⌘P)"}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => clearRequests()}
              className="size-7"
            >
              <Trash2 size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Clear (⌘E)</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-4" />

        <Button
          variant="outline"
          size="sm"
          onClick={onSearchClick}
          className="h-7 w-40 justify-start gap-2 px-2 text-xs text-muted-foreground"
        >
          <Search size={14} />
          <span>Search...</span>
          <kbd className="ml-auto rounded border border-border bg-muted px-1 text-[10px]">
            ⌘K
          </kbd>
        </Button>

        <ConnectionPill status={connectionStatus} sessionCount={sessions.length} />
      </div>
    </header>
  );
}
