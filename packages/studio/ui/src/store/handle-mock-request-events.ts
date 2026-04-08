/**
 * Per-request and chaos-experiment handlers for the `mock:*` event stream.
 *
 * Covers the high-frequency request lifecycle (`mock:request:start|end|error`)
 * and the lower-frequency network configuration / experiment events that
 * adjust the chaos engine state.
 */

import type { MockServerInfo } from "./mock-slice-types";
import type { NetworkConfig } from "./mock-slice-network-types";
import type { MockEvent } from "./mock-event-types";

import { useMockStore } from "./mock-slice";
import { updateRouteStats } from "./route-stats";

export function handleRequestStart(serverId: string, event: MockEvent): void {
  const store = useMockStore.getState();
  store.addLog({
    id: (event.requestId as string) ?? `${Date.now()}`,
    serverId,
    timestamp: (event.timestamp as number) ?? Date.now(),
    httpMethod: (event.httpMethod as string) ?? "GET",
    path: (event.path as string) ?? "",
    group: (event.group as string) ?? "",
    endpoint: (event.endpoint as string) ?? "",
    variables: event.variables,
    requestHeaders: event.requestHeaders as Record<string, string> | undefined,
  });
}

export function handleRequestEnd(serverId: string, event: MockEvent): void {
  const store = useMockStore.getState();
  const requestId = event.requestId as string;
  const duration = (event.duration as number) ?? 0;
  const logs = store.logs;
  const idx = logs.findIndex((l) => l.id === requestId);
  if (idx < 0) return;

  const log = logs[idx]!;
  const updated = [...logs];
  updated[idx] = {
    ...log,
    status: (event.status as number) ?? 200,
    duration,
    data: event.data,
    responseHeaders: event.responseHeaders as Record<string, string> | undefined,
  };
  useMockStore.setState({ logs: updated });
  updateRouteStats(serverId, log.group, log.endpoint, log.httpMethod, duration);

  const server = useMockStore.getState().servers[serverId];
  if (!server) return;
  const patch: Partial<MockServerInfo> = { requestsServed: server.requestsServed + 1 };
  const scenarioCount = event.scenarioRequestCount as number | undefined;
  if (scenarioCount !== undefined) patch.scenarioRequestCount = scenarioCount;
  store.updateServer(serverId, patch);
}

export function handleRequestError(serverId: string, event: MockEvent): void {
  const store = useMockStore.getState();
  const requestId = event.requestId as string;
  const duration = (event.duration as number) ?? 0;
  const logs = store.logs;
  const idx = logs.findIndex((l) => l.id === requestId);
  if (idx < 0) return;

  const log = logs[idx]!;
  const updated = [...logs];
  updated[idx] = {
    ...log,
    status: (event.status as number) ?? 500,
    duration,
    error: (event.message as string) ?? "Unknown error",
  };
  useMockStore.setState({ logs: updated });
  updateRouteStats(serverId, log.group, log.endpoint, log.httpMethod, duration);

  const server = useMockStore.getState().servers[serverId];
  if (!server) return;
  store.updateServer(serverId, {
    requestsServed: server.requestsServed + 1,
    errorCount: server.errorCount + 1,
  });
}

export function handleNetworkConfig(serverId: string, event: MockEvent): void {
  const store = useMockStore.getState();
  const cfg = event.config as Record<string, unknown> | undefined;
  const autoHalted = cfg?.autoHalted === true;

  if (autoHalted) {
    // Reset both latency and chaos presets after an auto-halt.
    store.updateServer(serverId, {
      latencyPreset: "none",
      latencyStartedAt: null,
      chaosPreset: "none",
      chaosStartedAt: null,
      networkPreset: "none",
      networkConfig: null,
    });
    store.addExperimentEvent({
      id: `halt_${Date.now().toString(36)}`,
      serverId,
      timestamp: Date.now(),
      type: "auto-halted",
      mode: "chaos",
      errorRate: (cfg?.errorRate as number) ?? 0,
      reason: (cfg?.haltReason as string) ?? "stop condition met",
    });
    return;
  }

  if (cfg) {
    store.updateServer(serverId, {
      networkConfig: cfg as unknown as NetworkConfig,
    });
  }
}

export function handleExperimentEvent(serverId: string, event: MockEvent): void {
  const store = useMockStore.getState();
  const eventType = (event.eventType as string) ?? "started";
  store.addExperimentEvent({
    id: `exp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    serverId,
    timestamp: (event.timestamp as number) ?? Date.now(),
    type: eventType as "started" | "stopped" | "auto-halted",
    mode: (event.mode as string) ?? "unknown",
    errorRate: (event.errorRate as number) ?? 0,
    peakErrorRate: event.peakErrorRate as number | undefined,
    peakP99: event.peakP99 as number | undefined,
    durationMs: event.durationMs as number | undefined,
    reason: event.reason as string | undefined,
  });
}
