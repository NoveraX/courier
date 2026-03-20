import { Clock, Radio, RotateCw, Trash2 } from "lucide-react";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { CopyButton } from "@/components/shared/copy-button";
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
import { getSocket } from "@/socket";

import { useMockStore } from "@/store/mock-slice";

import type { MockServerInfo, NetworkPreset } from "@/store/mock-slice";

interface StatusBarProps {
  server: MockServerInfo;
}

const NETWORK_OPTIONS = [
  { value: "none" as const, label: "None" },
  { value: "3g" as const, label: "3G" },
  { value: "flaky" as const, label: "Flaky" },
  { value: "down" as const, label: "Down" },
];

const NETWORK_CONFIGS: Record<NetworkPreset, Record<string, unknown>> = {
  none: { latency: 0, errorRate: 0 },
  "3g": { latency: { min: 300, max: 600, jitter: 100 }, errorRate: 0 },
  flaky: { latency: { min: 50, max: 200 }, errorRate: 0.3, faultTypes: ["500", "503", "timeout"] },
  down: { latency: 0, errorRate: 1, faultTypes: ["503"] },
};

export function StatusBar({ server }: StatusBarProps): React.ReactElement {
  const serverUrl = server.url || `http://localhost:${server.port}`;

  const sendCommand = (action: string, payload?: Record<string, unknown>) => {
    getSocket().emit("mock:command", { action, serverId: server.serverId, ...payload });
  };

  const handleNetworkChange = (preset: NetworkPreset) => {
    useMockStore.getState().updateServer(server.serverId, { networkPreset: preset });
    sendCommand("mock:network:set", { config: NETWORK_CONFIGS[preset], preset });
  };

  const heartbeatAgo = Date.now() - server.lastHeartbeat;
  const heartbeatFresh = heartbeatAgo < 15_000;

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border-subtle bg-muted/20 px-3 py-1.5">
      {/* URL + copy */}
      <div className="flex items-center gap-1 rounded bg-muted/40 px-1.5 py-0.5">
        <span className="font-mono text-[11px] text-muted-foreground/70">{serverUrl}</span>
        <CopyButton value={serverUrl} label="Copy URL" />
      </div>

      {/* Uptime */}
      <div className="flex items-center gap-1 text-body-xs text-muted-foreground/50">
        <Clock className="size-3" />
        <span className="tabular-nums">{formatUptime(server.uptime)}</span>
      </div>

      {/* Heartbeat */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 text-body-xs text-muted-foreground/50">
            <Radio className={cn("size-3", heartbeatFresh ? "text-emerald-400" : "text-amber-400")} />
            <span className={cn("tabular-nums", heartbeatFresh ? "text-emerald-400/70" : "text-amber-400/70")}>
              {formatHeartbeat(heartbeatAgo)}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">Last heartbeat</TooltipContent>
      </Tooltip>

      <div className="flex-1" />

      {/* Network preset */}
      <SegmentedControl options={NETWORK_OPTIONS} value={server.networkPreset} onChange={handleNetworkChange} />

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
            <SelectItem key={name} value={name} className="text-xs">{name}</SelectItem>
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
              className="size-6 text-muted-foreground/60 hover:text-foreground"
              onClick={() => sendCommand("mock:store:seed", { collection: "*", count: 20 })}
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
  );
}

function formatUptime(ms: number): string {
  if (ms < 1000) return "just started";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatHeartbeat(ms: number): string {
  if (ms < 2000) return "now";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}
