/** The state a request was matched in, and the setting of the state it saw. */
export interface ScenarioMark {
  readonly state: string;
  readonly epoch: number;
}

/** A mock's scenario state, as the requests it answers read and move it. */
export interface ScenarioState {
  get(): string;
  /** Set the state outright — a scenario applied, a reset — ending the transitions of requests matched before. */
  set(state: string): void;
  /** The state now, marked for a request that is matched in it. */
  mark(): ScenarioMark;
  /** A matched request's transition, taken only while the state it was matched in still holds. */
  transition(from: ScenarioMark, to: string): void;
}

/**
 * The state machine behind `inState` and `transitionTo`.
 *
 * A request picks its handler by the state it arrives in, then waits out its
 * latency before its transition is applied. A transition holds only when no
 * scenario was applied meanwhile and the state is still the one it moves
 * on from.
 *
 * @param initial - The state before any transition
 * @returns The state, with its transitions
 * @example
 * ```ts
 * const scenario = createScenarioState();
 * const mark = scenario.mark(); // { state: "Started", epoch: 0 }
 * scenario.transition(mark, "LoggedIn");
 * scenario.get(); // "LoggedIn"
 * ```
 */
export function createScenarioState(initial = "Started"): ScenarioState {
  let state = initial;
  let epoch = 0;
  return {
    get: () => state,
    set(next) {
      state = next;
      epoch++;
    },
    mark: () => ({ state, epoch }),
    transition(from, to) {
      if (from.epoch !== epoch || from.state !== state) return;
      state = to;
    },
  };
}
