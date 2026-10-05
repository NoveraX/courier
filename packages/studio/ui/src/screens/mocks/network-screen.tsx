import { useState } from "react";

import type { ChaosFormValues, ChaosMode } from "@/features/mocks/chaos-config";
import { chaosModeOf, FORM_DEFAULTS, PRESET_CONFIG } from "@/features/mocks/chaos-config";
import { experimentLog } from "@/features/mocks/experiment-log";
import { logsOf } from "@/features/mocks/mock-log";
import { networkLive } from "@/features/mocks/network-live";
import { faultsByType, latencyHistogram, statusStrip } from "@/features/mocks/observed-model";
import { useFirstLoad } from "@/hooks/use-first-load";
import { useNow } from "@/hooks/use-tick";
import { useMockInspector } from "@/inspector/use-mock-inspector";
import { setChaos } from "@/mocks/network-commands";
import { useStudioStore } from "@/store";
import type { MockServerInfo } from "@/store/mock-slice";
import { useMockStore } from "@/store/mock-slice";
import { ChaosCards } from "./chaos-cards";
import { FaultPanel } from "./fault-panel";
import { LatencyPanel } from "./latency-panel";
import { MocksSkeleton } from "./mocks-skeleton";
import { NetworkHero } from "./network-hero";
import { ObservedPanel } from "./observed-panel";
import { RouteOverridesPanel } from "./route-overrides-panel";
import { SafetyPanel } from "./safety-panel";
import { useMockServer } from "./use-mock-server";

/* The rate and mix in force; with no chaos, the mix a custom run would start from. */
function chaosValuesOf(server: MockServerInfo): ChaosFormValues {
  const weights = server.networkConfig?.faultWeights ?? [];
  return {
    errorRate: Math.round((server.networkConfig?.errorRate ?? 0) * 100),
    faultWeights: weights.length ? weights : FORM_DEFAULTS.faultWeights,
  };
}

function pickChaos(server: MockServerInfo, mode: ChaosMode, current: ChaosFormValues): void {
  if (mode === "custom")
    setChaos(server, "custom", {
      ...current,
      errorRate: current.errorRate || FORM_DEFAULTS.errorRate,
    });
  else setChaos(server, mode, PRESET_CONFIG[mode]);
}

function NetworkTab({ server }: { server: MockServerInfo }): React.ReactNode {
  const [faultDraft, setFaultDraft] = useState<ChaosFormValues | null>(null);
  const allLogs = useMockStore((s) => s.logs);
  const history = useMockStore((s) => s.experimentHistory);
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  const now = useNow();
  const sheet = useMockInspector();
  const logs = logsOf(allLogs, server.serverId);
  const disabled = server.processStatus !== "running";
  const mode = chaosModeOf(server.chaosPreset);
  const current = chaosValuesOf(server);
  return (
    <div className="mx-auto flex w-full max-w-320 flex-col gap-4 px-6 pt-5 pb-11">
      <NetworkHero server={server} figures={networkLive(logs, now, slowMs)} />
      <ChaosCards
        mode={mode}
        customRate={current.errorRate}
        disabled={disabled}
        onPick={(next) => pickChaos(server, next, current)}
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(380px,1fr))] items-start gap-4">
        <div className="flex min-w-0 flex-col gap-4">
          <FaultPanel
            values={faultDraft ?? current}
            disabled={disabled}
            onChange={setFaultDraft}
            onCommit={(values) => {
              setFaultDraft(null);
              setChaos(server, "custom", values);
            }}
          />
          <LatencyPanel server={server} disabled={disabled} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <ObservedPanel
            bins={latencyHistogram(logs, slowMs)}
            strip={statusStrip(logs)}
            faults={faultsByType(logs)}
            onOpen={sheet.open}
          />
          <RouteOverridesPanel server={server} disabled={disabled} />
        </div>
      </div>
      <SafetyPanel
        server={server}
        lines={experimentLog(history, server.serverId)}
        now={now}
        disabled={disabled}
      />
    </div>
  );
}

/**
 * The mock's Network tab: the condition it serves under and its live
 * figures, its chaos mode, the faults it injects and the delay it adds,
 * what its latest answers looked like, its per-route overrides, and what
 * halts a run.
 *
 * @returns The Network tab
 * @example
 * ```tsx
 * <MockNetworkScreen />
 * ```
 */
export function MockNetworkScreen(): React.ReactNode {
  const { server } = useMockServer();
  const first = useFirstLoad();
  const loading = first.requests || first.sources;
  if (!server) return loading ? <MocksSkeleton view="list" /> : null;
  return <NetworkTab key={server.serverId} server={server} />;
}
