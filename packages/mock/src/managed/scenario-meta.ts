/**
 * Build scenario metadata for Studio UI from raw scenario objects.
 */

import type { RouteInfo } from "../auto/route-analyzer";
import { introspectScenario } from "../auto/scenario-introspect";
import type { ChildScenarioMeta } from "./types";

export function buildScenarioMeta(
  allScenarios: Record<string, unknown>,
  routes: RouteInfo[],
): ChildScenarioMeta[] {
  return Object.keys(allScenarios).map((name) => {
    const scenario = allScenarios[name] as {
      apply?: unknown;
      description?: string;
      tags?: string[];
    } | null;
    const result =
      scenario && typeof scenario.apply === "function"
        ? introspectScenario(scenario as Parameters<typeof introspectScenario>[0], routes)
        : { endpoints: [], stateTransitions: [], hasStateMachine: false, error: undefined };
    const { endpoints, stateTransitions, hasStateMachine, error } = result;
    return {
      name,
      description: scenario?.description,
      tags: scenario?.tags,
      endpointCount: endpoints.length,
      isActive: false,
      hasStateMachine,
      ...(error === undefined ? {} : { introspectionError: error }),
      stateTransitions,
      endpoints,
    };
  });
}
