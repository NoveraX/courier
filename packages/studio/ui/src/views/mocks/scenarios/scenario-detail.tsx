import { coveragePercent, deriveScenarioType } from "./scenario-utils";
import { EndpointSection, groupByField } from "./scenario-detail-endpoints";
import { ScenarioDetailHeader } from "./scenario-detail-header";
import { ScenarioDetailMetrics } from "./scenario-detail-metrics";
import { StateMachineDiagram } from "./state-machine-diagram";

import type { MockScenarioEntry } from "@/store/mock-slice";

interface ScenarioDetailProps {
  scenario: MockScenarioEntry;
  isActive: boolean;
  totalRoutes: number;
  serverId: string;
  onClose: () => void;
}

export function ScenarioDetail({
  scenario,
  isActive,
  totalRoutes,
  serverId,
  onClose,
}: ScenarioDetailProps): React.ReactElement {
  const type = deriveScenarioType(scenario);
  const coverage = coveragePercent(scenario.endpointCount, totalRoutes);
  const okCount = scenario.endpoints.filter(
    (e) => e.behavior === "resolves" || e.behavior === "returns",
  ).length;
  const errorCount = scenario.endpoints.filter((e) => e.behavior === "rejects").length;
  const seqCount = scenario.endpoints.filter((e) => e.behavior === "sequence").length;
  const topLevel = scenario.endpoints.filter((e) => e.group === null);
  const grouped = groupByField(scenario.endpoints.filter((e) => e.group !== null));

  return (
    <div className="flex h-full w-105 shrink-0 flex-col border-l border-border-subtle bg-background">
      <ScenarioDetailHeader
        scenario={scenario}
        type={type}
        isActive={isActive}
        serverId={serverId}
        onClose={onClose}
      />

      <div className="flex-1 overflow-y-auto">
        <ScenarioDetailMetrics
          scenario={scenario}
          totalRoutes={totalRoutes}
          coverage={coverage}
          okCount={okCount}
          errorCount={errorCount}
          seqCount={seqCount}
        />

        {scenario.hasStateMachine && (
          <div className="border-b border-border-subtle">
            <div className="flex h-8 items-center px-5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/35">
                State Machine
              </span>
            </div>
            <StateMachineDiagram initialState={undefined} transitions={scenario.stateTransitions} />
          </div>
        )}

        {topLevel.length > 0 && <EndpointSection label="Endpoints" endpoints={topLevel} />}
        {[...grouped].map(([group, endpoints]) => (
          <EndpointSection key={group} label={group} endpoints={endpoints} />
        ))}
        {scenario.endpoints.length === 0 && (
          <div className="px-5 py-10 text-center">
            <p className="text-body-xs text-muted-foreground/35">No endpoint details available.</p>
          </div>
        )}
      </div>
    </div>
  );
}
