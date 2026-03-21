import { Clock, RotateCw, Trash2 } from "lucide-react";
import { useElapsed } from "@/hooks/use-tick";
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
  const active = server.processStatus === "running";
  const elapsed = useElapsed(server.startedAt || null, active);

  const sendCommand = (action: string, payload?: Record<string, unknown>) => {
    getSocket().emit("mock:command", { action, serverId: server.serverId, ...payload });
  };

  const handleNetworkChange = (preset: NetworkPreset) => {
    useMockStore.getState().updateServer(server.serverId, { networkPreset: preset });
    sendCommand("mock:network:set", { config: NETWORK_CONFIGS[preset], preset });
  };

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border-subtle bg-muted/20 px-3 py-1.5">
      {/* URL + copy */}
      <div className="flex items-center gap-1 rounded bg-muted/40 px-1.5 py-0.5">
        <span className="font-mono text-[11px] text-muted-foreground/70">{serverUrl}</span>
        <CopyButton value={serverUrl} label="Copy URL" />
      </div>

      {/* Uptime — computed on client from startedAt */}
      <div className="flex items-center gap-1 text-body-xs text-muted-foreground/50">
        <Clock className="size-3" />
        <span className="tabular-nums">{elapsed ?? "—"}</span>
      </div>

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

