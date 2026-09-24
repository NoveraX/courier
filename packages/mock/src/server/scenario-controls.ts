/**
 * Mock builder factories and scenario application logic.
 *
 * `createScenarioControls` returns the three pieces the bootstrap needs
 * to wire up scenarios:
 *
 * - `mock`        — the base-layer builder, persists across scenario switches
 * - `scenarioMock` — the scenario-layer builder, cleared on `applyScenario`
 * - `applyScenario` — clears the scenario layer + call counts, runs the
 *                     scenario's `apply` against `scenarioMock`, and updates
 *                     the supplied scenario state setter
 *
 * The bootstrap owns `scenarioState` and `callCounts` and threads them in
 * via callbacks so this helper has no hidden state.
 */

import { createEnhancedMockBuilder } from "../builder";
import type { MockRegistry } from "../registry";
import type { AnyMockScenario, EnhancedMockBuilder, UntypedMockFn } from "../types";

/** Dependencies threaded in from the bootstrap */
export interface ScenarioControlsDeps {
  registry: MockRegistry;
  callCounts: Map<string, number>;
  setScenarioState: (state: string) => void;
}

/** Builders + scenario applier returned to the bootstrap */
export interface ScenarioControls {
  mock: UntypedMockFn;
  scenarioMock: UntypedMockFn;
  applyScenario: (scenario: AnyMockScenario) => void;
}

/** Build the mock + scenario builder pair and the scenario applier */
export function createScenarioControls(deps: ScenarioControlsDeps): ScenarioControls {
  const { registry, callCounts, setScenarioState } = deps;

  function mock<TResponse, TVariables>(
    group: string,
    method: string,
  ): EnhancedMockBuilder<TResponse, TVariables> {
    const existing = registry.peek(group, method);
    return createEnhancedMockBuilder((handler) => {
      registry.setBase(group, method, handler);
    }, existing);
  }

  function scenarioMock<TResponse, TVariables>(
    group: string,
    method: string,
  ): EnhancedMockBuilder<TResponse, TVariables> {
    return createEnhancedMockBuilder((handler) => {
      registry.set(group, method, handler);
    });
  }

  function applyScenario(scenario: AnyMockScenario): void {
    registry.clear();
    callCounts.clear();
    setScenarioState(scenario.initialState ?? "Started");
    scenario.apply(scenarioMock);
  }

  return { mock, scenarioMock, applyScenario };
}
