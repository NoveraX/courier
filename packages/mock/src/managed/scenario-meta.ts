/**
 * Build scenario metadata for Studio UI from raw scenario objects.
 */

import type { RouteInfo } from "../auto/route-types";
import { introspectScenario } from "../auto/scenario-introspect";
import type { AnyMockScenario } from "../types";
import type { ChildScenarioMeta } from "./types";

/**
 * What Studio shows of each scenario: its name, description and tags, the
 * endpoints it changes and the states it moves through, and whether it is
 * the one in force.
 *
 * @param allScenarios - The server's scenarios, by name
 * @param routes - The routes the server answers
 * @param active - The scenario in force, if any
 * @returns One entry a scenario
 * @example
 * ```ts
 * buildScenarioMeta(server.scenarios, routes, server.activeScenario)[0]?.isActive; // true
 * ```
 */
export function buildScenarioMeta(
  allScenarios: Readonly<Record<string, AnyMockScenario>>,
  routes: RouteInfo[],
  active: string | null = null,
): ChildScenarioMeta[] {
  return Object.entries(allScenarios).map(([name, scenario]) => {
    const result = introspectScenario(scenario, routes);
    const { endpoints, stateTransitions, hasStateMachine, error } = result;
    return {
      name,
      ...(scenario.description !== undefined && { description: scenario.description }),
      ...(scenario.tags && { tags: scenario.tags }),
      endpointCount: endpoints.length,
      isActive: name === active,
      hasStateMachine,
      ...(error === undefined ? {} : { introspectionError: error }),
      stateTransitions,
      endpoints,
    };
  });
}
