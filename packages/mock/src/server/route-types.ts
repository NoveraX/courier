/**
 * The shapes the route generator and its request lifecycle helpers share, in
 * a module of their own so a helper can name them without the request
 * handler module.
 */

import type { NetworkState } from "../network/state";
import type { MockRegistry } from "../registry";
import type { ScenarioMark } from "../scenario/scenario-state";
import type { MockHistoryEntry, NetworkConfig } from "../types";
import type { Elsewhere } from "./elsewhere";
import type { BodyLimits } from "./read-request-body";

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
  network?: NetworkConfig | undefined;
  /** Dynamic network state — takes precedence over static `network` */
  networkState?: NetworkState;
  hooks?: RequestHooks;
  /** Fires when the server stops, to end its event streams */
  streamsStopping?: () => AbortSignal;
  /** The calls the mock leaves to the source's own server, or answers with recordings of it */
  elsewhere?: Elsewhere | undefined;
  /** Whether an override or a scenario answers an endpoint, which wins over its recordings */
  answersOwn?: ((group: string, method: string) => boolean) | undefined;
  /** The most of a request body the mock reads: JSON, and a form or an upload */
  bodyLimits?: BodyLimits | undefined;
}
