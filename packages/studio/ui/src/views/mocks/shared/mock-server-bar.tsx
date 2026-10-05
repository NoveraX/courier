import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { openMockWizard } from "@/mocks/wizard/open-mock-wizard";
import { useAddMockBlocked } from "@/mocks/wizard/use-add-mock-blocked";
import { useAllServers, useMockStore, useServerCount } from "@/store/mock-slice";
import { ProcessStatusBadge, ServerControls } from "./server-controls";

/** Server selector + status + controls rendered inside TopBar on /mocks pages */
export function MockServerBar(): React.ReactElement {
  const serverCount = useServerCount();
  const servers = useAllServers();
  const activeServerId = useMockStore((s) => s.activeServerId);
  const selectServer = useMockStore((s) => s.selectServer);
  const activeServer = servers.find((s) => s.serverId === activeServerId);
  const addBlocked = useAddMockBlocked();

  return (
    <div className="flex items-center gap-2">
      {serverCount > 0 && (
        <>
          {servers.length > 1 ? (
            <Select value={activeServerId ?? ""} onValueChange={selectServer}>
              <SelectTrigger
                size="sm"
                className="h-7 w-44 gap-1.5 border-none bg-muted/40 text-xs font-medium"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {servers.map((s) => (
                  <SelectItem key={s.serverId} value={s.serverId} className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <StatusDot status={s.processStatus} />
                      {s.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : activeServer ? (
            <div className="flex h-7 items-center gap-1.5 rounded-md bg-muted/40 px-2.5 text-xs font-medium">
              <StatusDot status={activeServer.processStatus} />
              <span>{activeServer.name}</span>
            </div>
          ) : null}

          {activeServer && (
            <>
              <ProcessStatusBadge
                status={activeServer.processStatus}
                lastError={activeServer.lastError}
              />
              <ServerControls
                serverId={activeServer.serverId}
                processStatus={activeServer.processStatus}
                managed={activeServer.managed}
              />
            </>
          )}

          <div className="h-4 w-px bg-border-subtle" />
        </>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          {/* A disabled button gets no pointer events, so the reason's tooltip hangs on a wrapper. */}
          <span tabIndex={addBlocked ? 0 : undefined}>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground/60 hover:text-foreground"
              aria-label={addBlocked ? `Add mock server: ${addBlocked}` : "Add mock server"}
              disabled={addBlocked !== null}
              onClick={openMockWizard}
            >
              <Plus className="size-3.5" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">{addBlocked ?? "Add mock server"}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function StatusDot({ status }: { status: string }): React.ReactElement {
  const color =
    status === "running"
      ? "bg-emerald-400 shadow-[0_0_4px_--theme(--color-emerald-400/0.6)]"
      : status === "starting" || status === "restarting"
        ? "bg-sky-400 animate-pulse"
        : status === "crashed"
          ? "bg-rose-400"
          : "bg-zinc-500";

  return <span className={cn("size-1.5 shrink-0 rounded-full", color)} />;
}
