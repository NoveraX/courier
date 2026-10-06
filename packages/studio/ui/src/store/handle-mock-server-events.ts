/**
 * Server lifecycle / catalog handlers for the `mock:*` event stream.
 *
 * Covers events that mutate server registration, route lists, collection
 * snapshots and scenario state — i.e. the "shape of the world" the UI
 * shows. Per-request logs and chaos/experiment events live in
 * `handle-mock-request-events.ts`.
 */

import { num, optNum, optStr, str } from "./event-helpers";
import type { MockEvent } from "./mock-event-types";
import { mockServerOf } from "./mock-server-of";
import { useMockStore } from "./mock-slice";
import type { MockServerInfo, MockSliceState, ProcessStatus } from "./mock-slice-types";
import {
  isMockCollectionEntry,
  isMockScenarioEntry,
  readList,
  readMockRoutes,
  readNetworkConfig,
  readOneOf,
} from "./payload";
import { mergeRouteStats } from "./route-stats";

const LATENCY_PRESETS = ["none", "3g", "4g", "satellite", "custom"] as const;
const CHAOS_PRESETS = ["none", "degraded", "unstable", "down", "custom"] as const;
const PROCESS_STATUSES: readonly ProcessStatus[] = [
  "declared",
  "starting",
  "running",
  "stopping",
  "stopped",
  "crashed",
  "restarting",
];

const routesOf = (event: MockEvent) => readMockRoutes(event.routes);
const collectionsOf = (event: MockEvent) => readList(event.collections, isMockCollectionEntry);
const scenariosOf = (event: MockEvent) => readList(event.scenarios, isMockScenarioEntry);
const namesOf = (value: unknown) =>
  readList(value, (item): item is string => typeof item === "string");
const optNull = (value: unknown) => (value === null ? null : optNum(value));

type Store = MockSliceState;

type NetworkPatch = Pick<
  MockServerInfo,
  "latencyPreset" | "latencyStartedAt" | "chaosPreset" | "chaosStartedAt" | "networkConfig"
>;

/** Server snapshot patch derived from a connect/reconnect event */
function buildNetworkPatch(event: MockEvent): NetworkPatch {
  return {
    latencyPreset: readOneOf(event.latencyPreset, LATENCY_PRESETS) ?? "none",
    latencyStartedAt: optNull(event.latencyStartedAt) ?? null,
    chaosPreset: readOneOf(event.chaosPreset, CHAOS_PRESETS) ?? "none",
    chaosStartedAt: optNull(event.chaosStartedAt) ?? null,
    networkConfig: readNetworkConfig(event.networkConfig) ?? null,
  };
}

function reconnectServer(
  store: Store,
  serverId: string,
  existing: MockServerInfo,
  event: MockEvent,
): void {
  const incomingScenarios = scenariosOf(event);
  const incomingCollections = collectionsOf(event);
  const incomingRoutes = routesOf(event) ?? existing.routes;
  // Preserve client-side hits/avgLatency when server re-sends route list
  const mergedRoutes = mergeRouteStats(existing.routes, incomingRoutes);
  store.updateServer(serverId, {
    status: "connected",
    /* Each event says where the mock listens now — its own port and URL while
       it runs, the one it will use and none while it does not. */
    port: optNum(event.port) ?? existing.port,
    url: optStr(event.url) ?? existing.url,
    source: optStr(event.source),
    lastError: optStr(event.lastError),
    startedAt: optNum(event.startedAt) ?? existing.startedAt,
    routeCount: num(event.routeCount),
    collectionCount: num(event.collectionCount),
    recordCount: num(event.recordCount),
    requestsServed: optNum(event.requestsServed) ?? existing.requestsServed,
    scenarioRequestCount: optNum(event.scenarioRequestCount) ?? existing.scenarioRequestCount,
    errorCount: optNum(event.errorCount) ?? existing.errorCount,
    activeScenario: optStr(event.activeScenario) ?? null,
    availableScenarios: namesOf(event.availableScenarios) ?? [],
    scenarios: incomingScenarios?.length ? incomingScenarios : existing.scenarios,
    collections: incomingCollections ?? existing.collections,
    storeSeq: incomingCollections ? num(event.storeSeq) : existing.storeSeq,
    routes: mergedRoutes,
    processStatus: readOneOf(event.processStatus, PROCESS_STATUSES) ?? existing.processStatus,
    ...buildNetworkPatch(event),
  });
}

function registerNewServer(store: Store, serverId: string, event: MockEvent): void {
  store.addServer({
    serverId,
    name: str(event.name, serverId),
    source: optStr(event.source),
    port: num(event.port),
    url: str(event.url),
    status: "connected",
    startedAt: num(event.startedAt, Date.now()),
    routeCount: num(event.routeCount),
    collectionCount: num(event.collectionCount),
    recordCount: num(event.recordCount),
    requestsServed: num(event.requestsServed),
    scenarioRequestCount: num(event.scenarioRequestCount),
    errorCount: num(event.errorCount),
    activeScenario: optStr(event.activeScenario) ?? null,
    availableScenarios: namesOf(event.availableScenarios) ?? [],
    networkPreset: "none",
    ...buildNetworkPatch(event),
    managed: event.managed === true,
    processStatus: readOneOf(event.processStatus, PROCESS_STATUSES) ?? "running",
    lastError: optStr(event.lastError),
    origin: event.origin === "studio" ? "studio" : "external",
    filePath: optStr(event.filePath),
    collections: collectionsOf(event) ?? [],
    storeSeq: num(event.storeSeq),
    routes: routesOf(event) ?? [],
    scenarios: scenariosOf(event) ?? [],
  });
}

export function handleServerConnect(serverId: string, event: MockEvent): void {
  const store = useMockStore.getState();
  const existing = mockServerOf(store.servers, serverId);
  if (existing) {
    reconnectServer(store, serverId, existing, event);
  } else {
    registerNewServer(store, serverId, event);
  }
}

export function handleScenarioActive(serverId: string, event: MockEvent): void {
  const store = useMockStore.getState();
  const activeName = optStr(event.scenario) ?? null;
  store.updateServer(serverId, {
    activeScenario: activeName,
    scenarioRequestCount: num(event.scenarioRequestCount),
  });
  // If the event carries updated scenario metadata (with real endpoint counts), use it;
  // otherwise just flip the isActive flag on the existing list.
  const incomingScenarios = scenariosOf(event);
  if (incomingScenarios?.length) {
    store.setServerScenarios(serverId, incomingScenarios);
  } else {
    const existing = mockServerOf(store.servers, serverId);
    if (existing) {
      store.setServerScenarios(
        serverId,
        existing.scenarios.map((s) => ({ ...s, isActive: s.name === activeName })),
      );
    }
  }
  // Update route sources (auto → scenario after activation).
  const incomingRoutes = routesOf(event);
  if (incomingRoutes?.length) {
    store.setServerRoutes(serverId, incomingRoutes);
  }
}
