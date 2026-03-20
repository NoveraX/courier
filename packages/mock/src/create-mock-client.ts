import type { ExecuteBackend } from "@noverax/nexus";
import { buildClientProxy, HTTPError } from "@noverax/nexus";
import type { DefinedApi } from "@noverax/nexus/define";
import { createEnhancedMockBuilder } from "./builder";
import { createFaultError, pickFault, shouldFail } from "./network/failure";
import { resolveLatency } from "./network/latency";
import { createMockRegistry } from "./registry";
import type {
  EnhancedMockBuilder,
  MockHistoryEntry,
  MockRequestContext,
  MockScenario,
  NetworkConfig,
  TypedMockFn,
} from "./types";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
  client: import("@noverax/nexus").TypedClient<TApi>;
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
  const history: MockHistoryEntry[] = [];
  const callCounts = new Map<string, number>();
  let scenarioState = "Started";

  const callKey = (group: string, method: string) => `${group}/${method}`;

  const backend: ExecuteBackend = async (group, method, variables, _options, _raw) => {
    const start = Date.now();
    const key = callKey(group, method);
    const index = callCounts.get(key) ?? 0;
    callCounts.set(key, index + 1);

    // Check for random network failures
    if (config?.network && shouldFail(config.network)) {
      const fault = pickFault(config.network);
      const { status, message } = createFaultError(fault);
      const error = new HTTPError({ status, headers: new Headers(), data: { message } });
      const entry: MockHistoryEntry = {
        group,
        method,
        variables,
        error,
        mocked: true,
        duration: Date.now() - start,
        timestamp: start,
      };
      history.push(entry);
      throw error;
    }

    const handler = registry.get(group, method, scenarioState);

    if (!handler) {
      const error = new Error(
        `[nexus-mock] No mock for "${group}.${method}" in state "${scenarioState}". ` +
          `Call mock("${group}", "${method}").resolves(data) first.`,
      );
      history.push({
        group,
        method,
        variables,
        error,
        mocked: false,
        duration: Date.now() - start,
        timestamp: start,
      });
      throw error;
    }

    // Apply delay
    const delay =
      handler.delayMs ??
      (handler.latency ? resolveLatency(handler.latency) : undefined) ??
      (config?.network?.latency
        ? resolveLatency(
            typeof config.network.latency === "number"
              ? { min: config.network.latency, max: config.network.latency }
              : config.network.latency,
          )
        : undefined);

    if (delay) await sleep(delay);

    // Build context
    const ctx: MockRequestContext = {
      variables,
      headers: new Headers(),
      callIndex: index,
      scenarioState,
    };

    // Execute handler
    if (handler.isError) {
      const data = await handler.fn(ctx);
      const error = new HTTPError({
        status: handler.status,
        headers: new Headers(handler.headers),
        data,
      });
      history.push({
        group,
        method,
        variables,
        error,
        mocked: true,
        result: { status: handler.status, data, headers: handler.headers },
        duration: Date.now() - start,
        timestamp: start,
      });
      throw error;
    }

    const data = await handler.fn(ctx);

    // Transition scenario state if configured
    if (handler.newState) {
      scenarioState = handler.newState;
    }

    history.push({
      group,
      method,
      variables,
      mocked: true,
      result: { status: handler.status, data, headers: handler.headers },
      duration: Date.now() - start,
      timestamp: start,
    });

    return data;
  };

  function mock(group: string, method: string): EnhancedMockBuilder {
    return createEnhancedMockBuilder((handler) => {
      registry.set(group, method, handler);
    });
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

  // Apply initial scenario
  if (config?.scenario) {
    mockClient.applyScenario(config.scenario);
  }

  return mockClient;
}
