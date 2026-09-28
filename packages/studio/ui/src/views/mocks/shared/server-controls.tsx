import { Loader2, Play, RefreshCw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { getSocket } from "@/socket";

import type { ProcessStatus } from "@/store/mock-slice";

interface ServerControlsProps {
  serverId: string;
  processStatus: ProcessStatus;
  managed: boolean;
}

const STATUS_BADGE: Record<ProcessStatus, { label: string; variant: "emerald" | "amber" | "rose" | "secondary" | "sky" }> = {
  declared: { label: "Declared", variant: "secondary" },
  starting: { label: "Starting", variant: "sky" },
  running: { label: "Running", variant: "emerald" },
  stopping: { label: "Stopping", variant: "amber" },
  stopped: { label: "Stopped", variant: "secondary" },
  crashed: { label: "Crashed", variant: "rose" },
  restarting: { label: "Restarting", variant: "sky" },
};

/**
 * A managed mock's status. When something went wrong — it crashed, or it
 * keeps serving an older definition because the latest one cannot be read —
 * the reason opens on hover and on keyboard focus.
 */
export function ProcessStatusBadge({ status, lastError }: { status: ProcessStatus; lastError?: string }): React.ReactElement {
  const { label, variant } = STATUS_BADGE[status];
  if (!lastError) return <Badge variant={variant} className="text-caption">{label}</Badge>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={status === "crashed" ? variant : "amber"}
          className="text-caption"
          tabIndex={0}
          aria-label={`${label}: ${lastError}`}
        >
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-96 whitespace-pre-wrap font-mono text-xs">{lastError}</TooltipContent>
    </Tooltip>
  );
}

export function ServerControls({ serverId, processStatus, managed }: ServerControlsProps): React.ReactElement | null {
  if (!managed) return null;

  const sendManaged = (command: string) => {
    getSocket().emit("mock:managed", { command, serverId });
  };

  const isTransitioning = processStatus === "starting" || processStatus === "stopping" || processStatus === "restarting";
  const isRunning = processStatus === "running";
  const canStart = processStatus === "declared" || processStatus === "stopped" || processStatus === "crashed";

  return (
    <div className="flex items-center gap-0.5">
      {isTransitioning && <Loader2 className="size-3 animate-spin text-muted-foreground/60" />}

      {canStart && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Start server" className="size-6 text-emerald-400 hover:text-emerald-300" onClick={() => sendManaged("mock:managed:start")}>
              <Play className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Start server</TooltipContent>
        </Tooltip>
      )}

      {isRunning && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Restart server" className="size-6 text-muted-foreground/60 hover:text-amber-400" onClick={() => sendManaged("mock:managed:restart")}>
                <RefreshCw className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Restart server</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Stop server" className="size-6 text-muted-foreground/60 hover:text-rose-400" onClick={() => sendManaged("mock:managed:stop")}>
                <Square className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Stop server</TooltipContent>
          </Tooltip>
        </>
      )}
    </div>
  );
}
