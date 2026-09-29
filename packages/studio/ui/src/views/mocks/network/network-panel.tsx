import type { MockServerInfo } from "@/store/mock-slice";
import { ChaosControls } from "./chaos-controls";
import { ExperimentHistory } from "./experiment-history";
import { LatencyControls } from "./latency-controls";
import { NetworkStats } from "./network-stats";
import type { PanelMode } from "./network-toolbar";
import { PerRouteOverrides } from "./per-route-overrides";
import { ScenarioManager } from "./scenario-manager";

interface NetworkPanelProps {
  server: MockServerInfo;
  panelMode: PanelMode;
}

export function NetworkPanel({ server, panelMode }: NetworkPanelProps): React.ReactElement {
  return (
    <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
      {/* Left — Controls */}
      <div className="space-y-4">
        {panelMode === "global" ? (
          <>
            <LatencyControls server={server} />
            <ChaosControls server={server} />
            <ScenarioManager server={server} currentMode={server.chaosPreset} />
            <ExperimentHistory serverId={server.serverId} />
          </>
        ) : (
          <PerRouteOverrides server={server} />
        )}
      </div>

      {/* Right — Live metrics */}
      <div className="space-y-4">
        <NetworkStats server={server} />
      </div>
    </div>
  );
}
