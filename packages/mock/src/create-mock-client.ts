import type { TypedClient } from "@noverax/courier";
import { buildClientProxy } from "@noverax/courier";
import type { DefinedApi } from "@noverax/courier/define";
import { createMockBackend } from "./backend";
import { createEnhancedMockBuilder } from "./builder";
import { createHistory } from "./history";
import { createMockRegistry } from "./registry";
import type {
  EnhancedMockBuilder,
  MockHistoryEntry,
  MockScenario,
  NetworkConfig,
  TypedMockFn,
} from "./types";

/** Configuration for the mock client */
export interface MockClientConfig {
  /** Default network simulation for all endpoints */
  network?: NetworkConfig;
  /** Initial scenario to apply */
  scenario?: MockScenario<any>;
}

/** The mock client returned by createMockClient */
export interface MockClient<TApi extends DefinedApi<any>> {
  /** Typed client — same dot-notation API as createCaller */
  client: TypedClient<TApi>;
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
export function createMockClient<TApi extends DefinedApi<any>>(
  config?: MockClientConfig,
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

  function mock(group: string, method: string): EnhancedMockBuilder {
    const existing = registry.peek(group, method);
    return createEnhancedMockBuilder((handler) => {
      registry.set(group, method, handler);
    }, existing);
  }

  const mockClient: MockClient<TApi> = {
    client: buildClientProxy(backend) as MockClient<TApi>["client"],
    mock: mock as TypedMockFn<TApi>,
    history,
    scenarioState: "Started",

    applyScenario(scenario) {
      registry.clear();
      callCounts.clear();
      scenarioState = "Started";
      scenario.apply(mock as TypedMockFn<TApi>);
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
