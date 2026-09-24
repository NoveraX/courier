/**
 * Server lifecycle / catalog handlers for the `mock:*` event stream.
 *
 * Covers events that mutate server registration, route lists, collection
 * snapshots and scenario state — i.e. the "shape of the world" the UI
 * shows. Per-request logs and chaos/experiment events live in
 * `handle-mock-request-events.ts`.
 */

import type { ChaosPreset, LatencyPreset, NetworkConfig } from "./mock-slice-network-types";
import type {
  MockCollectionEntry,
  MockRouteEntry,
  MockScenarioEntry,
  MockServerInfo,
  MockSliceState,
  ProcessStatus,
} from "./mock-slice-types";
import type { MockEvent } from "./mock-event-types";

import { useMockStore } from "./mock-slice";
import { mergeRouteStats } from "./route-stats";

type Store = MockSliceState;

type NetworkPatch = Pick<
  MockServerInfo,
  "latencyPreset" | "latencyStartedAt" | "chaosPreset" | "chaosStartedAt" | "networkConfig"
>;

/** Server snapshot patch derived from a connect/reconnect event */
function buildNetworkPatch(event: MockEvent): NetworkPatch {
  return {
    latencyPreset: ((event.latencyPreset as string) ?? "none") as LatencyPreset,
    latencyStartedAt: (event.latencyStartedAt as number | null) ?? null,
    chaosPreset: ((event.chaosPreset as string) ?? "none") as ChaosPreset,
    chaosStartedAt: (event.chaosStartedAt as number | null) ?? null,
    networkConfig: (event.networkConfig as NetworkConfig) ?? null,
  };
}

function reconnectServer(
  store: Store,
  serverId: string,
  existing: MockServerInfo,
  event: MockEvent,
): void {
  const incomingScenarios = event.scenarios as MockScenarioEntry[] | undefined;
  const incomingRoutes = (event.routes as MockRouteEntry[]) ?? existing.routes;
  // Preserve client-side hits/avgLatency when server re-sends route list
  const mergedRoutes = mergeRouteStats(existing.routes, incomingRoutes);
  store.updateServer(serverId, {
    status: "connected",
    /* Each event says where the mock listens now — its own port and URL while
       it runs, the one it will use and none while it does not. */
    port: (event.port as number) ?? existing.port,
    url: (event.url as string) ?? existing.url,
    lastError: (event.lastError as string | null) ?? undefined,
    startedAt: (event.startedAt as number) ?? existing.startedAt,
    routeCount: (event.routeCount as number) ?? 0,
    collectionCount: (event.collectionCount as number) ?? 0,
    recordCount: (event.recordCount as number) ?? 0,
    requestsServed: (event.requestsServed as number | undefined) ?? existing.requestsServed,
    scenarioRequestCount:
      (event.scenarioRequestCount as number) ?? existing.scenarioRequestCount,
    errorCount: (event.errorCount as number | undefined) ?? existing.errorCount,
    activeScenario: (event.activeScenario as string) ?? null,
    availableScenarios: (event.availableScenarios as string[]) ?? [],
    scenarios: incomingScenarios?.length ? incomingScenarios : existing.scenarios,
    collections: (event.collections as MockCollectionEntry[]) ?? existing.collections,
    routes: mergedRoutes,
    processStatus: (event.processStatus as ProcessStatus) ?? existing.processStatus,
    ...buildNetworkPatch(event),
  });
}

function registerNewServer(store: Store, serverId: string, event: MockEvent): void {
  store.addServer({
    serverId,
    name: (event.name as string) ?? serverId,
    port: (event.port as number) ?? 0,
    url: (event.url as string) ?? "",
    status: "connected",
    startedAt: (event.startedAt as number) ?? Date.now(),
    routeCount: (event.routeCount as number) ?? 0,
    collectionCount: (event.collectionCount as number) ?? 0,
    recordCount: (event.recordCount as number) ?? 0,
    requestsServed: (event.requestsServed as number) ?? 0,
    scenarioRequestCount: (event.scenarioRequestCount as number) ?? 0,
    errorCount: (event.errorCount as number) ?? 0,
    activeScenario: (event.activeScenario as string) ?? null,
    availableScenarios: (event.availableScenarios as string[]) ?? [],
    networkPreset: "none",
    ...buildNetworkPatch(event),
    managed: (event.managed as boolean) ?? false,
    processStatus: (event.processStatus as ProcessStatus) ?? "running",
    lastError: (event.lastError as string | null) ?? undefined,
    origin: (event.origin as "studio" | "external") ?? "external",
    filePath: (event.filePath as string) ?? undefined,
    collections: (event.collections as MockCollectionEntry[]) ?? [],
    routes: (event.routes as MockRouteEntry[]) ?? [],
    scenarios: (event.scenarios as MockScenarioEntry[]) ?? [],
  });
}

export function handleServerConnect(serverId: string, event: MockEvent): void {
  const store = useMockStore.getState();
  const existing = store.servers[serverId];
  if (existing) {
    reconnectServer(store, serverId, existing, event);
  } else {
    registerNewServer(store, serverId, event);
  }
}

export function handleStoreChange(serverId: string, event: MockEvent): void {
  const store = useMockStore.getState();
  const col = event.collection as string;
  const count = (event.count as number) ?? 0;
  const server = store.servers[serverId];
  if (!server) return;
  store.setServerCollections(
    serverId,
    server.collections.map((c) => (c.name === col ? { ...c, count } : c)),
  );
}

export function handleScenarioActive(serverId: string, event: MockEvent): void {
  const store = useMockStore.getState();
  const activeName = (event.scenario as string) ?? null;
  store.updateServer(serverId, {
    activeScenario: activeName,
    scenarioRequestCount: (event.scenarioRequestCount as number) ?? 0,
  });
  // If the event carries updated scenario metadata (with real endpoint counts), use it;
  // otherwise just flip the isActive flag on the existing list.
  const incomingScenarios = event.scenarios as MockScenarioEntry[] | undefined;
  if (incomingScenarios?.length) {
    store.setServerScenarios(serverId, incomingScenarios);
  } else {
    const existing = store.servers[serverId];
    if (existing) {
      store.setServerScenarios(
        serverId,
        existing.scenarios.map((s) => ({ ...s, isActive: s.name === activeName })),
      );
    }
  }
  // Update route sources (auto → scenario after activation).
  const incomingRoutes = event.routes as MockRouteEntry[] | undefined;
  if (incomingRoutes?.length) {
    store.setServerRoutes(serverId, incomingRoutes);
  }
}
