import { createLogger } from "@noverax/courier";
import { isThenable } from "../scenario/is-thenable";
import type { AnyMockScenario } from "../types";
import type { RouteInfo } from "./route-types";
import type { ScenarioEndpointEntry, StateTransition } from "./scenario-recorder";
import { createScenarioRecorder } from "./scenario-recorder";

export type { ScenarioEndpointEntry, StateTransition } from "./scenario-recorder";

const log = createLogger("MockScenario");

/** Full result of scenario introspection */
export interface ScenarioIntrospectionResult {
  endpoints: ScenarioEndpointEntry[];
  stateTransitions: StateTransition[];
  hasStateMachine: boolean;
  /**
   * Why the scenario could not be read to the end, when it could not: it threw
   * while recording, or it returned a promise, so `endpoints` holds only what
   * it set up before that.
   */
  error?: string;
}

/**
 * Run scenario.apply() with a recording mock to extract endpoint metadata
 * without registering any handlers. Returns endpoints + state machine info.
 *
 * `apply()` is imperative, so what a scenario overrides is only knowable by
 * running it. Reading must never fail the mock the scenario belongs to: a
 * throw is kept as `error`, and so is a promise returned by an async setup,
 * whose later failure is logged rather than left unhandled in the process
 * that read it.
 *
 * @param scenario - The scenario to read
 * @param routes - The source's routes
 * @returns What the scenario sets up
 */
export function introspectScenario(
  scenario: AnyMockScenario,
  routes: RouteInfo[],
): ScenarioIntrospectionResult {
  const recorder = createScenarioRecorder(routes);
  let error: string | undefined;
  try {
    const returned: unknown = scenario.apply(recorder.mock);
    if (isThenable(returned)) {
      error = "its setup returned a promise; a scenario sets up its mocks synchronously";
      returned.then(undefined, (reason: unknown) =>
        log.warn(`Scenario "${scenario.name}" failed after it was read`, reason),
      );
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const transitions = recorder.transitions();
  return {
    endpoints: recorder.endpoints(),
    stateTransitions: transitions,
    hasStateMachine: transitions.length > 0 || scenario.initialState !== undefined,
    ...(error === undefined ? {} : { error }),
  };
}
