import { Square, Zap } from "lucide-react";
import { useCallback } from "react";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { useElapsed } from "@/hooks/use-tick";
import type { MockServerInfo } from "@/store/mock-slice";
import { stopAllFaults } from "./stop-all-faults";

export type PanelMode = "global" | "per-route";

const MODE_OPTIONS: Array<{ value: PanelMode; label: string }> = [
  { value: "global", label: "Global" },
  { value: "per-route", label: "Per Route" },
];

interface NetworkToolbarProps {
  server: MockServerInfo;
  panelMode: PanelMode;
  onPanelModeChange: (mode: PanelMode) => void;
}

export function NetworkToolbar({
  server,
  panelMode,
  onPanelModeChange,
}: NetworkToolbarProps): React.ReactElement {
  const latencyActive = server.latencyPreset !== "none";
  const chaosActive = server.chaosPreset !== "none";
  const anyActive = latencyActive || chaosActive;

  const latencyElapsed = useElapsed(server.latencyStartedAt, latencyActive);
  const chaosElapsed = useElapsed(server.chaosStartedAt, chaosActive);
  const handleStop = useCallback(() => stopAllFaults(server.serverId), [server.serverId]);

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
      <SegmentedControl options={MODE_OPTIONS} value={panelMode} onChange={onPanelModeChange} />

      {latencyActive && (
        <>
          <div className="h-4 w-px bg-border-subtle" />
          <div className="flex items-center gap-1.5 rounded-md bg-sky-600 px-2 py-0.5 dark:bg-sky-500/90">
            <span className="size-1.5 animate-pulse rounded-full bg-white/70" />
            <span className="text-mono-xs text-white/90 tabular-nums">
              {server.latencyPreset.toUpperCase()}
              {latencyElapsed ? ` · ${latencyElapsed}` : ""}
            </span>
          </div>
        </>
      )}

      {chaosActive && (
        <>
          {!latencyActive && <div className="h-4 w-px bg-border-subtle" />}
          <div className="flex items-center gap-1.5 rounded-md bg-rose-600 px-2 py-0.5 dark:bg-rose-500/90">
            <span className="size-1.5 animate-pulse rounded-full bg-white/70" />
            <span className="text-mono-xs text-white/90 tabular-nums">
              {server.chaosPreset.toUpperCase()}
              {chaosElapsed ? ` · ${chaosElapsed}` : ""}
            </span>
          </div>
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
        {anyActive ? (
          <button
            type="button"
            onClick={handleStop}
            className="flex h-7 items-center gap-1.5 rounded-md bg-rose-600 px-3 text-xs font-medium text-white shadow-sm transition-all hover:bg-rose-700 active:scale-[0.97] dark:bg-rose-500 dark:hover:bg-rose-600"
          >
            <Square className="size-2.5 fill-current" />
            Stop All
          </button>
        ) : (
          <div className="flex items-center gap-1.5 text-body-xs text-muted-foreground/40">
            <Zap className="size-3" />
            No faults active
          </div>
        )}
      </div>
    </div>
  );
}
