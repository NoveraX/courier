import { useRouterState } from "@tanstack/react-router";
import { Command, Pause, Play, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useDevToolsStore } from "@/store";
import { getPageTitle } from "@/app-config";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface TopBarProps {
  onOpenSearch: () => void;
}

export function TopBar({ onOpenSearch }: TopBarProps): React.ReactNode {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const paused = useDevToolsStore((s) => s.paused);
  const togglePaused = useDevToolsStore((s) => s.togglePaused);
  const clearRequests = useDevToolsStore((s) => s.clearRequests);
  const requestCount = useDevToolsStore((s) => s.requests.length);

  const title = getPageTitle(pathname);

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
      <SidebarTrigger className="size-6 text-muted-foreground" />

      <h1 className="text-h3 text-foreground select-none">{title}</h1>

      {paused && (
        <span className="rounded bg-warning-muted px-1.5 py-0.5 text-caption text-warning-foreground">
          Paused
        </span>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 px-2 text-body-xs text-muted-foreground"
          onClick={onOpenSearch}
        >
          <Command className="size-3" />
          <span>K</span>
        </Button>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn("size-7", paused && "text-warning-foreground")}
              onClick={togglePaused}
            >
              {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {paused ? "Resume" : "Pause"}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              onClick={clearRequests}
              disabled={requestCount === 0}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Clear</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
