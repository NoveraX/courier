import { applyStoreReport, readStoreReport } from "@noverax/courier-studio-core";

import { isPlainObject } from "../is-plain-object";
import { isDescribedRoute } from "./is-described-route";
import { isListOf } from "./is-list-of";
import { isScenarioMeta } from "./is-scenario-meta";
import type { ServerState } from "./types";

/* A report applies to the store as the one before it left it. One older than
   the store Studio holds — sent before a mock started again — is passed
   over; one that skips a report, or whose edits do not fit, leaves Studio's
   copy out of step, and the mock is asked for its store whole. */
function applyStoreChanges(state: ServerState, event: Record<string, unknown>): boolean {
  const report = readStoreReport(event);
  if (report === undefined) return true;
  if (!report.whole && report.seq !== state.storeSeq + 1) return report.seq <= state.storeSeq;
  const collections = applyStoreReport(state.collections, report);
  if (collections === undefined) return false;
  state.collections = collections;
  state.storeSeq = report.seq;
  return true;
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

type NetworkState = Pick<
  ServerState,
  "latencyPreset" | "latencyStartedAt" | "chaosPreset" | "chaosStartedAt" | "networkConfig"
>;

/** A mock that simulates nothing: no preset, no settings. */
export const NO_NETWORK: NetworkState = {
  latencyPreset: undefined,
  latencyStartedAt: undefined,
  chaosPreset: undefined,
  chaosStartedAt: undefined,
  networkConfig: undefined,
};

/**
 * The network conditions a mock reported, as Studio keeps them: its presets,
 * when each started, and its settings. A mock that halted its experiment
 * simulates nothing any more: the notice it sends is not its settings.
 *
 * @param config - The conditions as the worker sent them
 * @returns The fields of the mock's state they set
 * @example
 * ```ts
 * Object.assign(state, networkStateOf({ latency: 0, errorRate: 0.4, chaosPreset: "unstable" }));
 * ```
 */
export function networkStateOf(config: Record<string, unknown>): NetworkState {
  return {
    latencyPreset: presetOf(config.latencyPreset),
    latencyStartedAt: startedAtOf(config.latencyStartedAt),
    chaosPreset: presetOf(config.chaosPreset),
    chaosStartedAt: startedAtOf(config.chaosStartedAt),
    networkConfig: config.autoHalted === true ? undefined : config,
  };
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
 * @returns `false` when Studio's copy of the store fell out of step with the mock's, which then is to send it whole
 * @example
 * ```ts
 * applyWorkerEvent(state, { type: "mock:scenario:active", scenario: "empty", scenarios, routes });
 * ```
 */
export function applyWorkerEvent(state: ServerState, event: Record<string, unknown>): boolean {
  const { type, config } = event;
  if (type === "mock:store:changes") return applyStoreChanges(state, event);
  if (type === "mock:scenario:active") {
    applyScenario(state, event);
  } else if (type === "mock:network:config" && isPlainObject(config)) {
    Object.assign(state, networkStateOf(config));
  }
  return true;
}
