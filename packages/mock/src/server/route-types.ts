/**
 * Shared types for the route generator and its helpers.
 *
 * Extracted from `route-generator.ts` so that the request lifecycle helpers
 * (`route-network`, `route-response`) can import the `RouteConfig` and
 * `RequestHooks` shapes without pulling in the entire request handler module.
 *
 * The original `route-generator.ts` re-exports these types so external imports
 * (e.g. `create-mock-server.ts`) keep working unchanged.
 */

import type { NetworkState } from "../network/state";
import type { MockRegistry } from "../registry";
import type { ScenarioMark } from "../scenario/scenario-state";
import type { MockHistoryEntry, NetworkConfig } from "../types";

/** Hooks for emitting request lifecycle events (set by the worker Studio runs a mock in) */
export interface RequestHooks {
  onStart?(
    id: string,
    httpMethod: string,
    path: string,
    group: string,
    endpoint: string,
    variables?: unknown,
    requestHeaders?: Record<string, string>,
  ): void;
  onEnd?(
    id: string,
    status: number,
    data: unknown,
    duration: number,
    latencyInjected: number,
    scenarioState: string,
    responseHeaders?: Record<string, string>,
  ): void;
  onError?(id: string, status: number, message: string, duration: number): void;
}

/** Configuration passed to every route handler — registry, history, hooks, network */
export interface RouteConfig {
  registry: MockRegistry;
  history: MockHistoryEntry[];
  callCounts: Map<string, number>;
  getScenarioState: () => string;
  setScenarioState: (state: string) => void;
  /** The state now, for a request matched in it. */
  markScenario: () => ScenarioMark;
  /** A matched request's transition; see `createScenarioState`. */
  transitionScenario: (from: ScenarioMark, to: string) => void;
  network?: NetworkConfig;
  /** Dynamic network state — takes precedence over static `network` */
  networkState?: NetworkState;
  hooks?: RequestHooks;
}
