import { useNavigate, useSearch } from "@tanstack/react-router";

import type { MockScenariosSearch } from "@/features/mocks/scenario-view";
import { inspectorOf } from "@/features/requests/inspector-of";
import { useFirstLoad } from "@/hooks/use-first-load";
import { MocksSkeleton } from "./mocks-skeleton";
import { ScenarioCard } from "./scenario-card";
import { ScenarioDetail } from "./scenario-detail";
import { useMockServer } from "./use-mock-server";

/**
 * The mock's scenarios: a card each with what it is for, the one on marked
 * Active and any other turned on with a click; and the scenario open, with
 * the states it walks and the routes it answers.
 *
 * @returns The Scenarios tab
 * @example
 * ```tsx
 * <MockScenariosScreen />
 * ```
 */
export function MockScenariosScreen(): React.ReactNode {
  const { server } = useMockServer();
  const first = useFirstLoad();
  const loading = first.requests || first.sources;
  const search: MockScenariosSearch = useSearch({ from: "/mocks/scenarios" });
  const navigate = useNavigate({ from: "/mocks/scenarios" });
  if (!server) return loading ? <MocksSkeleton view="list" /> : null;
  if (server.scenarios.length === 0) {
    return (
      <p className="mx-auto max-w-120 p-10 text-center text-control text-fg-subtle">
        This mock declares no scenarios. Add some with{" "}
        <span className="font-mono">defineScenario</span> under{" "}
        <span className="font-mono">scenarios</span> in courier.mocks.ts.
      </p>
    );
  }
  const open =
    server.scenarios.find((s) => s.name === search.scenario) ??
    server.scenarios.find((s) => s.isActive) ??
    server.scenarios[0];
  return (
    <div className="mx-auto grid w-full max-w-300 grid-cols-[repeat(auto-fit,minmax(340px,1fr))] items-start gap-3.5 px-6 pt-5 pb-10">
      <div className="flex flex-col gap-2">
        {server.scenarios.map((scenario) => (
          <ScenarioCard
            key={scenario.name}
            scenario={scenario}
            serverId={server.serverId}
            selected={scenario.name === open?.name}
            running={server.processStatus === "running"}
            onOpen={() =>
              void navigate({
                search: (prev) => ({ ...inspectorOf(prev), scenario: scenario.name }),
                replace: true,
              })
            }
          />
        ))}
      </div>
      {open && (
        <ScenarioDetail
          scenario={open}
          routes={server.routes}
          served={open.isActive ? server.scenarioRequestCount : undefined}
        />
      )}
    </div>
  );
}
