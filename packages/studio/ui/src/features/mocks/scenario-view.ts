import type { MockRouteEntry, MockScenarioEndpoint, MockScenarioEntry } from "@/store/mock-slice";

/** The mock's own scenario that clears every override: each route answers as the mock generates it. */
export const HAPPY_PATH = "happy-path";

/** The Scenarios tab's part of the address: the scenario open. */
export interface MockScenariosSearch {
  scenario?: string | undefined;
}

/**
 * Read the Scenarios tab's parameters from its address.
 *
 * @param raw - The address's parameters
 * @returns The scenario open, when the address names one
 * @example
 * ```ts
 * validateMockScenariosSearch({ scenario: "empty" }); // { scenario: "empty" }
 * ```
 */
export function validateMockScenariosSearch(raw: Record<string, unknown>): MockScenariosSearch {
  return typeof raw.scenario === "string" && raw.scenario ? { scenario: raw.scenario } : {};
}

/** What a scenario mostly does, which picks its icon and tone. */
export type ScenarioKind = "state" | "failure" | "slow" | "empty" | "custom";

/**
 * What a scenario mostly does: walk a state machine, fail calls, slow them
 * down, return set answers such as empty lists, or something of its own.
 *
 * @param scenario - The scenario
 * @returns Its kind
 * @example
 * ```ts
 * scenarioKindOf(checkoutFailure); // "failure"
 * ```
 */
export function scenarioKindOf(scenario: MockScenarioEntry): ScenarioKind {
  if (scenario.hasStateMachine) return "state";
  if (scenario.endpoints.some((e) => e.behavior === "rejects")) return "failure";
  if (scenario.endpoints.some((e) => (e.latency ?? 0) > 0)) return "slow";
  if (scenario.endpoints.some((e) => e.behavior === "returns")) return "empty";
  return "custom";
}

/** One override of a scenario: the route it answers and how. */
export interface ScenarioOverride {
  method: string;
  path: string;
  result: string;
  tone: "err" | "ok" | "muted";
  /** The delay it adds, if any. */
  delay: number | undefined;
}

function resultOf(endpoint: MockScenarioEndpoint): Pick<ScenarioOverride, "result" | "tone"> {
  if (endpoint.behavior === "rejects")
    return { result: `rejects ${endpoint.statusCode ?? 500}`, tone: "err" };
  if (endpoint.behavior === "sequence")
    return { result: `sequence of ${endpoint.sequenceLength ?? 0}`, tone: "muted" };
  if (endpoint.behavior === "returns") return { result: "returns a set answer", tone: "ok" };
  return {
    result: endpoint.behavior === "custom" ? "custom handler" : "resolves",
    tone: endpoint.behavior === "custom" ? "muted" : "ok",
  };
}

/**
 * A scenario's overrides: each route it answers — its method and path,
 * found among the server's routes — what it answers with, and the delay
 * it adds.
 *
 * @param scenario - The scenario
 * @param routes - The server's routes
 * @returns The overrides
 * @example
 * ```ts
 * scenarioOverrides(checkoutFailure, routes)[0]; // { method: "POST", path: "/orders", result: "rejects 402", tone: "err", delay: undefined }
 * ```
 */
export function scenarioOverrides(
  scenario: MockScenarioEntry,
  routes: readonly MockRouteEntry[],
): ScenarioOverride[] {
  return scenario.endpoints.map((endpoint) => {
    const route = routes.find(
      (r) =>
        r.endpoint === endpoint.endpoint && (endpoint.group === null || r.group === endpoint.group),
    );
    const name = endpoint.group ? `${endpoint.group}.${endpoint.endpoint}` : endpoint.endpoint;
    return {
      method: endpoint.httpMethod.toUpperCase(),
      path: route?.fullPath ?? name,
      ...resultOf(endpoint),
      delay: endpoint.latency && endpoint.latency > 0 ? endpoint.latency : undefined,
    };
  });
}
