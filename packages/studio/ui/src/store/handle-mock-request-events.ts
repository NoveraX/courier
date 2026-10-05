/**
 * Per-request and chaos-experiment handlers for the `mock:*` event stream.
 *
 * Covers the high-frequency request lifecycle (`mock:request:start|end|error`)
 * and the lower-frequency network configuration / experiment events that
 * adjust the chaos engine state.
 */

import { isPlainObject } from "@/socket/is-plain-object";
import { num, optNum, optStr, str } from "./event-helpers";
import type { MockEvent } from "./mock-event-types";
import { mockServerOf } from "./mock-server-of";
import { useMockStore } from "./mock-slice";
import type { MockServerInfo } from "./mock-slice-types";
import { readNetworkConfig, readOneOf, readStringRecord } from "./payload";
import { updateRouteStats } from "./route-stats";

const EXPERIMENT_EVENTS = ["started", "stopped", "auto-halted"] as const;
const ROUTE_SOURCES = ["auto", "override", "scenario", "upstream", "fixtures"] as const;

export function handleRequestStart(serverId: string, event: MockEvent): void {
  const store = useMockStore.getState();
  store.addLog({
    id: str(event.requestId, `${Date.now()}`),
    serverId,
    timestamp: num(event.timestamp, Date.now()),
    httpMethod: str(event.httpMethod, "GET"),
    path: str(event.path),
    group: str(event.group),
    endpoint: str(event.endpoint),
    source: readOneOf(event.source, ROUTE_SOURCES),
    variables: event.variables,
    requestHeaders: readStringRecord(event.requestHeaders),
  });
}

export function handleRequestEnd(serverId: string, event: MockEvent): void {
  const store = useMockStore.getState();
  const requestId = optStr(event.requestId);
  const duration = num(event.duration);
  const logs = store.logs;
  const idx = logs.findIndex((l) => l.id === requestId);
  const log = logs[idx];
  if (!log) return;

  const status = num(event.status, 200);
  const updated = [...logs];
  updated[idx] = {
    ...log,
    status,
    duration,
    data: event.data,
    responseHeaders: readStringRecord(event.responseHeaders),
  };
  useMockStore.setState({ logs: updated });
  updateRouteStats(serverId, log.group, log.endpoint, log.httpMethod, duration);

  const server = mockServerOf(useMockStore.getState().servers, serverId);
  if (!server) return;
  /* An error the mock answered with — an override's or a scenario's — is an
     error its caller got, as much as one its handler threw. */
  const patch: Partial<MockServerInfo> = {
    requestsServed: server.requestsServed + 1,
    ...(status >= 400 && { errorCount: server.errorCount + 1 }),
  };
  const scenarioCount = optNum(event.scenarioRequestCount);
  if (scenarioCount !== undefined) patch.scenarioRequestCount = scenarioCount;
  store.updateServer(serverId, patch);
}

export function handleRequestError(serverId: string, event: MockEvent): void {
  const store = useMockStore.getState();
  const requestId = optStr(event.requestId);
  const duration = num(event.duration);
  const logs = store.logs;
  const idx = logs.findIndex((l) => l.id === requestId);
  const log = logs[idx];
  if (!log) return;

  const updated = [...logs];
  updated[idx] = {
    ...log,
    status: num(event.status, 500),
    duration,
    error: str(event.message, "Unknown error"),
  };
  useMockStore.setState({ logs: updated });
  updateRouteStats(serverId, log.group, log.endpoint, log.httpMethod, duration);

  const server = mockServerOf(useMockStore.getState().servers, serverId);
  if (!server) return;
  store.updateServer(serverId, {
    requestsServed: server.requestsServed + 1,
    errorCount: server.errorCount + 1,
  });
}

export function handleNetworkConfig(serverId: string, event: MockEvent): void {
  const store = useMockStore.getState();
  const cfg = isPlainObject(event.config) ? event.config : undefined;
  const autoHalted = cfg?.autoHalted === true;

  /* A halt ends every run; the mock logs it with its own experiment event, and sends the settings it kept next. */
  if (autoHalted) {
    store.updateServer(serverId, {
      latencyPreset: "none",
      latencyStartedAt: null,
      chaosPreset: "none",
      chaosStartedAt: null,
      networkPreset: "none",
      networkConfig: null,
    });
    return;
  }

  const networkConfig = readNetworkConfig(cfg);
  if (networkConfig) store.updateServer(serverId, { networkConfig });
}

export function handleExperimentEvent(serverId: string, event: MockEvent): void {
  const store = useMockStore.getState();
  store.addExperimentEvent({
    id: `exp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    serverId,
    timestamp: num(event.timestamp, Date.now()),
    type: readOneOf(event.eventType, EXPERIMENT_EVENTS) ?? "started",
    mode: str(event.mode, "unknown"),
    errorRate: num(event.errorRate),
    durationMs: optNum(event.durationMs),
    reason: optStr(event.reason),
  });
}
