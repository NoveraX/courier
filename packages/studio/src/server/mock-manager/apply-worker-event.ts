import { isPlainObject } from "../is-plain-object";
import { isDescribedRoute } from "./is-described-route";
import { isListOf } from "./is-list-of";
import { isScenarioMeta } from "./is-scenario-meta";
import type { ServerState } from "./types";

type Collection = ServerState["collections"][number];

function isCollection(value: unknown): value is Collection {
  return (
    isPlainObject(value) &&
    typeof value.name === "string" &&
    typeof value.count === "number" &&
    Array.isArray(value.records)
  );
}

function presetOf(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function startedAtOf(value: unknown): number | null | undefined {
  return typeof value === "number" || value === null ? value : undefined;
}

function applyScenario(state: ServerState, event: Record<string, unknown>): void {
  const { scenario, scenarios, routes } = event;
  if (typeof scenario === "string") state.activeScenario = scenario;
  if (isListOf(scenarios, isScenarioMeta)) state.scenarios = scenarios;
  if (isListOf(routes, isDescribedRoute)) state.routes = routes;
}

/* A mock that halted its experiment simulates nothing any more: the notice
   it sends is not its settings. */
function applyNetworkConfig(state: ServerState, config: Record<string, unknown>): void {
  state.latencyPreset = presetOf(config.latencyPreset);
  state.latencyStartedAt = startedAtOf(config.latencyStartedAt);
  state.chaosPreset = presetOf(config.chaosPreset);
  state.chaosStartedAt = startedAtOf(config.chaosStartedAt);
  state.networkConfig = config.autoHalted === true ? undefined : config;
}

/**
 * Keep what Studio holds of a managed mock in step with an event its worker
 * sent, so a page that connects later is shown the mock as it is: the
 * store's collections, the scenario applied, the network presets.
 *
 * The worker sends what the mock's own definitions produced, so each field
 * is read for its shape, and one of another shape leaves what Studio holds
 * as it was.
 *
 * @param state - What Studio holds of the mock; updated in place
 * @param event - The event, as the worker's message carried it
 * @example
 * ```ts
 * applyWorkerEvent(state, { type: "mock:scenario:active", scenario: "empty", scenarios, routes });
 * ```
 */
export function applyWorkerEvent(state: ServerState, event: Record<string, unknown>): void {
  const { type, collections, config } = event;
  if (type === "mock:store:snapshot") {
    if (isListOf(collections, isCollection)) state.collections = collections;
  } else if (type === "mock:scenario:active") {
    applyScenario(state, event);
  } else if (type === "mock:network:config" && isPlainObject(config)) {
    applyNetworkConfig(state, config);
  }
}
