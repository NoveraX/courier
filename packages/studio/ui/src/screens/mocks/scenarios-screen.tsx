import { useNavigate, useSearch } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { FlaskConical, Inbox, ShieldAlert, Timer, Workflow } from "lucide-react";

import { Dot } from "@/design/dot";
import type { MockScenariosSearch, ScenarioKind } from "@/features/mocks/scenario-view";
import { scenarioKindOf } from "@/features/mocks/scenario-view";
import { cn } from "@/lib/utils";
import { getSocket } from "@/socket";
import { ScenarioDetail } from "./scenario-detail";
import { useMockServer } from "./use-mock-server";

const KIND_LOOK: Readonly<Record<ScenarioKind, { icon: LucideIcon; className: string }>> = {
  state: { icon: Workflow, className: "bg-brand-dim text-brand" },
  failure: { icon: ShieldAlert, className: "bg-err-dim text-err" },
  slow: { icon: Timer, className: "bg-warn-dim text-warn" },
  empty: { icon: Inbox, className: "bg-raised text-fg-muted" },
  custom: { icon: FlaskConical, className: "bg-syntax-keyword/12 text-syntax-keyword" },
};

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
  const search: MockScenariosSearch = useSearch({ from: "/next/mocks/scenarios" });
  const navigate = useNavigate({ from: "/next/mocks/scenarios" });
  if (!server) return null;
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
  const apply = (name: string) =>
    getSocket().emit("mock:command", {
      action: "mock:scenario:apply",
      serverId: server.serverId,
      scenario: name,
    });
  return (
    <div className="mx-auto grid w-full max-w-300 grid-cols-[repeat(auto-fit,minmax(340px,1fr))] items-start gap-3.5 px-6 pt-5 pb-10">
      <div className="flex flex-col gap-2">
        {server.scenarios.map((scenario) => {
          const look = KIND_LOOK[scenarioKindOf(scenario)];
          const selected = scenario.name === open?.name;
          return (
            <div
              key={scenario.name}
              className={cn(
                "flex items-center gap-3 rounded-dialog border px-3.5 py-3",
                selected
                  ? "border-brand/60 bg-brand-tint"
                  : "border-line bg-panel hover:border-line-strong",
              )}
            >
              <button
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  void navigate({
                    search: (prev) => ({ req: prev.req, tab: prev.tab, scenario: scenario.name }),
                    replace: true,
                  })
                }
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
              >
                <span
                  className={cn(
                    "flex size-8.5 shrink-0 items-center justify-center rounded-panel",
                    look.className,
                  )}
                >
                  <look.icon aria-hidden="true" className="size-3.75" />
                </span>
                <span className="flex min-w-0 flex-col gap-0.75">
                  <span className="flex items-center gap-2">
                    <span className="text-ui font-semibold">{scenario.name}</span>
                    {scenario.isActive && (
                      <span className="flex h-4.5 items-center gap-1.25 rounded-full bg-ok-dim px-1.75 text-micro font-bold tracking-[0.04em] text-ok">
                        <Dot tone="current" pulse />
                        ACTIVE
                      </span>
                    )}
                  </span>
                  <span className="truncate text-small text-fg-subtle">
                    {scenario.description ??
                      `Overrides ${scenario.endpointCount} ${scenario.endpointCount === 1 ? "route" : "routes"}`}
                  </span>
                </span>
              </button>
              <button
                type="button"
                disabled={scenario.isActive || server.processStatus !== "running"}
                onClick={() => apply(scenario.name)}
                className={cn(
                  "h-7 shrink-0 cursor-pointer rounded-control border px-2.75 text-small font-semibold disabled:cursor-default",
                  scenario.isActive
                    ? "border-ok/40 bg-ok-dim text-ok"
                    : "border-line-strong bg-panel text-fg hover:bg-raised disabled:opacity-50",
                )}
              >
                {scenario.isActive ? "Active" : "Activate"}
              </button>
            </div>
          );
        })}
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
