/**
 * Build scenario metadata for Studio UI from raw scenario objects.
 */

import type { RouteInfo } from "../auto/route-analyzer";
import { introspectScenario } from "../auto/scenario-introspect";
import type { AnyMockScenario } from "../types";
import type { ChildScenarioMeta } from "./types";

export function buildScenarioMeta(
  allScenarios: Readonly<Record<string, AnyMockScenario>>,
  routes: RouteInfo[],
): ChildScenarioMeta[] {
  return Object.entries(allScenarios).map(([name, scenario]) => {
    const result = introspectScenario(scenario, routes);
    const { endpoints, stateTransitions, hasStateMachine, error } = result;
    return {
      name,
      description: scenario.description,
      tags: scenario.tags,
      endpointCount: endpoints.length,
      isActive: false,
      hasStateMachine,
      ...(error === undefined ? {} : { introspectionError: error }),
      stateTransitions,
      endpoints,
    };
  });
}
