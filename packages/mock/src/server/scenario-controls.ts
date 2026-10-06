/**
 * Mock builder factories and scenario application logic.
 *
 * `createScenarioControls` returns the two pieces the bootstrap needs to
 * wire up scenarios:
 *
 * - `mock`        — the base-layer builder, persists across scenario switches
 * - `applyScenario` — runs the scenario's `apply`, then — only once it has
 *                     run whole — replaces the scenario layer with what it
 *                     defined, clears the call counts and resets the state
 *
 * The bootstrap owns `scenarioState` and `callCounts` and threads them in
 * via callbacks so this helper has no hidden state.
 */

import { createEnhancedMockBuilder } from "../builder";
import type { MockRegistry } from "../registry";
import type {
  AnyMockScenario,
  EnhancedMockBuilder,
  ResolvedHandler,
  UntypedMockFn,
} from "../types";

/** Dependencies threaded in from the bootstrap */
export interface ScenarioControlsDeps {
  registry: MockRegistry;
  callCounts: Map<string, number>;
  setScenarioState: (state: string) => void;
}

/** Builders + scenario applier returned to the bootstrap */
export interface ScenarioControls {
  mock: UntypedMockFn;
  applyScenario: (scenario: AnyMockScenario) => void;
}

/** Build the base-layer builder and the scenario applier */
export function createScenarioControls(deps: ScenarioControlsDeps): ScenarioControls {
  const { registry, callCounts, setScenarioState } = deps;

  function mock<TResponse, TVariables, TSend>(
    group: string,
    method: string,
  ): EnhancedMockBuilder<TResponse, TVariables, TSend> {
    /* The base layer builds on its own latest handler only: one from the
       scenario layer would be copied into the base for good, and outlive
       every scenario switch and reset. */
    const existing = registry.peekBase(group, method);
    return createEnhancedMockBuilder((handler) => {
      registry.setBase(group, method, handler);
    }, existing);
  }

  /* The definition runs against a staging list first: one that throws part-way
     leaves the scenario on, its counts and its state as they were, instead of
     a layer half cleared and half written. */
  function applyScenario(scenario: AnyMockScenario): void {
    const staged: Array<{ group: string; method: string; handler: ResolvedHandler }> = [];
    scenario.apply(<TResponse, TVariables, TSend>(group: string, method: string) =>
      createEnhancedMockBuilder<TResponse, TVariables, TSend>((handler) => {
        staged.push({ group, method, handler });
      }),
    );
    registry.clear();
    for (const { group, method, handler } of staged) registry.set(group, method, handler);
    callCounts.clear();
    setScenarioState(scenario.initialState ?? "Started");
  }

  return { mock, applyScenario };
}
