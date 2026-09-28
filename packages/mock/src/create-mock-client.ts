import type { ExecuteBackend, InferClient } from "@noverax/courier";
import { buildClientProxy } from "@noverax/courier";
import type { AnySource } from "@noverax/courier/define";
import { createMockBackend } from "./backend";
import { createEnhancedMockBuilder } from "./builder";
import { createHistory } from "./history";
import { createMockRegistry } from "./registry";
import type { TypedMockFn } from "./typed-mock-fn";
import type { EnhancedMockBuilder, MockHistoryEntry, MockScenario, NetworkConfig } from "./types";

/** Configuration for the mock client */
export interface MockClientConfig<TApi extends AnySource = AnySource> {
  /** Default network simulation for all endpoints */
  network?: NetworkConfig;
  /** Initial scenario to apply — written for `TApi`, or for no source */
  scenario?: MockScenario<NoInfer<TApi>>;
}

/** The mock client returned by createMockClient */
export interface MockClient<TApi extends AnySource> {
  /** Typed client — same dot-notation API as createCaller, for grouped, flat and mixed sources */
  client: InferClient<TApi>;
  /** Type-safe mock builder */
  mock: TypedMockFn<TApi>;
  /** Request history */
  history: MockHistoryEntry[];
  /** Switch to a different scenario */
  applyScenario(scenario: MockScenario<TApi>): void;
  /** Current scenario state (WireMock-style) */
  scenarioState: string;
  /** Transition scenario to a new state */
  transition(state: string): void;
  /** Reset all mocks, history, and state */
  reset(): void;
  /** Reset only mocks */
  resetMocks(): void;
  /** Reset only history */
  resetHistory(): void;
}

/**
 * Create a type-safe mock client with enhanced builder, scenarios,
 * network simulation, and WireMock-style state machines.
 *
 * @example
 * ```ts
 * const { client, mock, history } = createMockClient<typeof api>();
 *
 * mock("users", "getAll").resolves([{ id: "1", name: "Alice" }]);
 * const users = await client.users.getAll();
 *
 * expect(users).toEqual([{ id: "1", name: "Alice" }]);
 * ```
 */
export function createMockClient<TApi extends AnySource>(
  config?: MockClientConfig<TApi>,
): MockClient<TApi> {
  const registry = createMockRegistry();
  const history = createHistory();
  const callCounts = new Map<string, number>();
  let scenarioState = "Started";

  const backend = createMockBackend({
    registry,
    history,
    callCounts,
    getScenarioState: () => scenarioState,
    setScenarioState: (s) => {
      scenarioState = s;
    },
    network: config?.network,
  });

  function mock<TResponse, TVariables>(
    group: string,
    method: string,
  ): EnhancedMockBuilder<TResponse, TVariables> {
    const existing = registry.peek(group, method);
    return createEnhancedMockBuilder((handler) => {
      registry.set(group, method, handler);
    }, existing);
  }

  const mockClient: MockClient<TApi> = {
    client: mockedClient<TApi>(backend),
    mock,
    history,
    scenarioState: "Started",

    applyScenario(scenario) {
      registry.clear();
      callCounts.clear();
      scenarioState = "Started";
      scenario.apply(mock);
    },

    transition(state) {
      scenarioState = state;
    },

    reset() {
      registry.clear();
      history.length = 0;
      callCounts.clear();
      scenarioState = "Started";
    },

    resetMocks() {
      registry.clear();
      callCounts.clear();
    },

    resetHistory() {
      history.length = 0;
    },
  };

  if (config?.scenario) {
    mockClient.applyScenario(config.scenario);
  }

  return mockClient;
}

/* The proxy answers any member path, so it is the source's client by
   construction; the overload gives it that type, as `createCaller`'s do. */
function mockedClient<TApi extends AnySource>(backend: ExecuteBackend): InferClient<TApi>;
function mockedClient(backend: ExecuteBackend): unknown {
  return buildClientProxy(backend);
}
