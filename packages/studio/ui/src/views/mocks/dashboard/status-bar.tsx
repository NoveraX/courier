import { Clock, RotateCw, Square, Trash2 } from "lucide-react";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useElapsed } from "@/hooks/use-tick";
import { ownValue } from "@/lib/own-value";
import { cn } from "@/lib/utils";
import { stopAllFaults } from "@/mocks/stop-all-faults";
import { getSocket } from "@/socket";
import type { LatencyPreset, MockServerInfo } from "@/store/mock-slice";
import { useMockStore } from "@/store/mock-slice";
import { PRESET_VALUES } from "../network/latency-presets";
import { ServerAddress } from "./server-address";

interface StatusBarProps {
  server: MockServerInfo;
}

const LATENCY_OPTIONS = [
  { value: "none" as const, label: "Off" },
  { value: "3g" as const, label: "3G" },
  { value: "4g" as const, label: "4G" },
  { value: "satellite" as const, label: "Satellite" },
];

export function StatusBar({ server }: StatusBarProps): React.ReactElement {
  const active = server.processStatus === "running";
  const elapsed = useElapsed(server.startedAt || null, active);
  const anyFaultActive = server.latencyPreset !== "none" || server.chaosPreset !== "none";

  const sendCommand = (action: string, payload?: Record<string, unknown>) => {
    getSocket().emit("mock:command", { action, serverId: server.serverId, ...payload });
  };

  // Latency preset value for segmented control — show "none" for custom (managed via Network page)
  const latencyValue: LatencyPreset =
    server.latencyPreset === "custom" ? "none" : server.latencyPreset;

  const handleLatencyChange = (preset: string) => {
    if (preset === "none") {
      useMockStore
        .getState()
        .updateServer(server.serverId, { latencyPreset: "none", latencyStartedAt: null });
      sendCommand("mock:network:set", { config: { latency: 0, bandwidth: 0 }, preset: "none" });
      return;
    }
    const cfg = ownValue(PRESET_VALUES, preset);
    if (!cfg) return;
    useMockStore.getState().updateServer(server.serverId, {
      latencyPreset: preset as LatencyPreset,
      latencyStartedAt: Date.now(),
    });
    sendCommand("mock:network:set", { config: { latency: cfg }, preset });
  };

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border-subtle bg-muted/20 px-3 py-1.5">
      <ServerAddress server={server} />

      {/* Uptime */}
      <div className="flex items-center gap-1 text-body-xs text-muted-foreground/50">
        <Clock className="size-3" />
        <span className="tabular-nums">{elapsed ?? "—"}</span>
      </div>

      <div className="flex-1" />

      {/* Controls — disabled when server is not running */}
      <div className={cn("flex items-center gap-2.5", !active && "pointer-events-none opacity-40")}>
        {/* Latency preset — same values as /mocks/network (minus Custom) */}
        <SegmentedControl
          options={LATENCY_OPTIONS}
          value={latencyValue}
          onChange={handleLatencyChange}
        />

        {/* Stop button — only when any fault is active */}
        {anyFaultActive && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Stop all faults"
                onClick={() => stopAllFaults(server.serverId)}
                className="flex size-6 items-center justify-center rounded-md bg-rose-600/80 text-white transition-colors hover:bg-rose-700 dark:bg-rose-500/80 dark:hover:bg-rose-600"
              >
                <Square className="size-2.5 fill-current" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Stop all faults</TooltipContent>
          </Tooltip>
        )}

        {/* Separator */}
        <div className="h-4 w-px bg-border-subtle" />

        {/* Scenario */}
        <Select
          key={server.activeScenario}
          defaultValue={server.activeScenario ?? "happy-path"}
          onValueChange={(v) => sendCommand("mock:scenario:apply", { scenario: v })}
        >
          <SelectTrigger size="sm" className="h-6 w-32 border-none bg-muted/40 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {server.availableScenarios.map((name) => (
              <SelectItem key={name} value={name} className="text-xs">
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Actions */}
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Re-seed all collections"
                className="size-6 text-muted-foreground/60 hover:text-foreground"
                onClick={() => sendCommand("mock:store:seed", { collection: "*" })}
              >
                <RotateCw className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Re-seed all collections</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Reset store"
                className="size-6 text-muted-foreground/60 hover:text-rose-400"
                onClick={() => sendCommand("mock:server:reset")}
              >
                <Trash2 className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Reset store</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
