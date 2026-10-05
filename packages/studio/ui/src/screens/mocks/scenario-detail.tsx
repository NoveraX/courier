import { ArrowRight } from "lucide-react";

import { methodText } from "@/design/method-color";
import { scenarioOverrides } from "@/features/mocks/scenario-view";
import { cn } from "@/lib/utils";
import type { MockRouteEntry, MockScenarioEntry } from "@/store/mock-slice";

const RESULT_TAG = {
  err: "bg-err-dim text-err",
  ok: "bg-ok-dim text-ok",
  muted: "bg-raised text-fg-muted",
} as const;

interface ScenarioDetailProps {
  scenario: MockScenarioEntry;
  routes: readonly MockRouteEntry[];
  /** Requests answered since the scenario was turned on, while it is on. */
  served: number | undefined;
}

/**
 * The scenario open: its name and what it is for, the states it walks
 * through when it declares a state machine, and each route it answers —
 * with what, and any delay.
 *
 * @param props - The scenario, the server's routes, and the requests since it was turned on
 * @returns The panel
 * @example
 * ```tsx
 * <ScenarioDetail scenario={scenario} routes={server.routes} served={12} />
 * ```
 */
export function ScenarioDetail({ scenario, routes, served }: ScenarioDetailProps): React.ReactNode {
  const overrides = scenarioOverrides(scenario, routes);
  return (
    <section
      aria-label={`Scenario ${scenario.name}`}
      className="flex flex-col overflow-hidden rounded-dialog border border-line bg-panel"
    >
      <div className="flex flex-col gap-1 border-b border-line px-4 py-3.5">
        <h2 className="text-title font-semibold">{scenario.name}</h2>
        <p className="text-small text-fg-muted">
          {scenario.description ??
            `Overrides ${scenario.endpointCount} ${scenario.endpointCount === 1 ? "route" : "routes"}`}
        </p>
        {served !== undefined && (
          <p className="text-badge text-fg-subtle">
            {served} {served === 1 ? "request" : "requests"} answered since it was turned on
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2.5 px-4 py-3.5">
        {scenario.hasStateMachine && scenario.stateTransitions.length > 0 && (
          <>
            <h3 className="text-label font-semibold text-fg-muted">States</h3>
            <div className="flex flex-wrap items-center gap-1.5">
              {scenario.stateTransitions.map((t) => (
                <span
                  key={`${t.from}>${t.to}:${t.trigger}`}
                  className="flex items-center gap-1.5 font-mono text-label"
                >
                  <span className="flex h-6.5 items-center rounded-control border border-line bg-inset px-2.25">
                    {t.from}
                  </span>
                  <ArrowRight aria-hidden="true" className="size-3 text-fg-subtle" />
                  <span className="flex h-6.5 items-center rounded-control border border-brand/40 bg-brand-dim px-2.25 text-brand">
                    {t.to}
                  </span>
                  <span className="font-sans text-badge text-fg-subtle">on {t.trigger}</span>
                </span>
              ))}
            </div>
          </>
        )}
        <h3 className="pt-1.5 text-label font-semibold text-fg-muted">Overrides</h3>
        <div className="overflow-hidden rounded-panel border border-line">
          {overrides.length === 0 && (
            <p className="px-3 py-3.5 text-small text-fg-subtle">
              No overrides — every route answers as the mock generates it.
            </p>
          )}
          {overrides.map((o) => (
            <div
              key={`${o.method} ${o.path}`}
              className="grid min-h-9 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-line px-3 py-1 font-mono text-small last:border-b-0"
            >
              <span className={cn("text-meta font-semibold", methodText(o.method))}>
                {o.method}
              </span>
              <span className="truncate">{o.path}</span>
              <span className="flex items-center gap-1.5">
                {o.delay !== undefined && (
                  <span className="flex h-5 items-center rounded-[5px] bg-warn-dim px-1.75 font-sans text-badge text-warn">
                    +{o.delay}ms
                  </span>
                )}
                <span
                  className={cn(
                    "flex h-5 items-center rounded-[5px] px-1.75 font-sans text-badge",
                    RESULT_TAG[o.tone],
                  )}
                >
                  {o.result}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
