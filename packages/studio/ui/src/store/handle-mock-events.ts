import { useMockStore } from "./mock-slice";
import { updateRouteStats } from "./route-stats";

import type { ChaosPreset, LatencyPreset, MockCollectionEntry, MockRouteEntry, MockScenarioEntry, MockServerInfo, NetworkConfig, ProcessStatus } from "./mock-slice";

type MockEvent = Record<string, unknown>;

/** Route mock:* events to the mock Zustand store */
export function handleMockEvent(event: MockEvent): void {
  const store = useMockStore.getState();
  const serverId = event.serverId as string;

  switch (event.type) {
    case "mock:server:connect": {
      const existing = useMockStore.getState().servers[serverId];
      // Network preset fields from server snapshot — restored on reconnect
      const netPatch = {
        latencyPreset: (event.latencyPreset as string ?? "none") as LatencyPreset,
        latencyStartedAt: (event.latencyStartedAt as number | null) ?? null,
        chaosPreset: (event.chaosPreset as string ?? "none") as ChaosPreset,
        chaosStartedAt: (event.chaosStartedAt as number | null) ?? null,
        networkConfig: (event.networkConfig as NetworkConfig) ?? null,
      };

      if (existing) {
        const incomingScenarios = event.scenarios as MockScenarioEntry[] | undefined;
        const incomingRoutes = (event.routes as MockRouteEntry[]) ?? existing.routes;
        // Preserve client-side hits/avgLatency when server re-sends route list
        const mergedRoutes = mergeRouteStats(existing.routes, incomingRoutes);
        store.updateServer(serverId, {
          status: "connected",
          startedAt: (event.startedAt as number) ?? existing.startedAt,
          routeCount: (event.routeCount as number) ?? 0,
          collectionCount: (event.collectionCount as number) ?? 0,
          recordCount: (event.recordCount as number) ?? 0,
          requestsServed: (event.requestsServed as number) ?? 0,
          scenarioRequestCount: (event.scenarioRequestCount as number) ?? existing.scenarioRequestCount,
          errorCount: (event.errorCount as number) ?? 0,
          activeScenario: (event.activeScenario as string) ?? null,
          availableScenarios: (event.availableScenarios as string[]) ?? [],
          scenarios: incomingScenarios?.length ? incomingScenarios : existing.scenarios,
          collections: (event.collections as MockCollectionEntry[]) ?? existing.collections,
          routes: mergedRoutes,
          processStatus: (event.processStatus as ProcessStatus) ?? existing.processStatus,
          ...netPatch,
        });
      } else {
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
          ...netPatch,
          managed: (event.managed as boolean) ?? false,
          processStatus: (event.processStatus as ProcessStatus) ?? "running",
          origin: (event.origin as "studio" | "external") ?? "external",
          filePath: (event.filePath as string) ?? undefined,
          collections: (event.collections as MockCollectionEntry[]) ?? [],
          routes: (event.routes as MockRouteEntry[]) ?? [],
          scenarios: (event.scenarios as MockScenarioEntry[]) ?? [],
        });
      }
      break;
    }

    case "mock:server:disconnect":
      store.updateServer(serverId, { status: "disconnected" });
      break;

    case "mock:route:list":
      store.setServerRoutes(serverId, (event.routes as never[]) ?? []);
      break;

    case "mock:store:snapshot":
      store.setServerCollections(serverId, (event.collections as MockCollectionEntry[]) ?? []);
      break;

    case "mock:store:change": {
      const col = event.collection as string;
      const count = (event.count as number) ?? 0;
      const server = useMockStore.getState().servers[serverId];
      if (server) {
        store.setServerCollections(
          serverId,
          server.collections.map((c) => (c.name === col ? { ...c, count } : c)),
        );
      }
      break;
    }

    case "mock:scenario:list":
      store.setServerScenarios(serverId, (event.scenarios as MockScenarioEntry[]) ?? []);
      break;

    case "mock:scenario:active": {
      const activeName = (event.scenario as string) ?? null;
      store.updateServer(serverId, {
        activeScenario: activeName,
        scenarioRequestCount: (event.scenarioRequestCount as number) ?? 0,
      });
      // If the event carries updated scenario metadata (with real endpoint counts), use it;
      // otherwise just flip the isActive flag on the existing list
      const incomingScenarios = event.scenarios as MockScenarioEntry[] | undefined;
      if (incomingScenarios?.length) {
        store.setServerScenarios(serverId, incomingScenarios);
      } else {
        const existing = useMockStore.getState().servers[serverId];
        if (existing) {
          store.setServerScenarios(
            serverId,
            existing.scenarios.map((s) => ({ ...s, isActive: s.name === activeName })),
          );
        }
      }
      // Update route sources (auto → scenario after activation)
      const incomingRoutes = event.routes as MockRouteEntry[] | undefined;
      if (incomingRoutes?.length) {
        store.setServerRoutes(serverId, incomingRoutes);
      }
      break;
    }

    case "mock:request:start":
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
      break;

    case "mock:request:end": {
      const requestId = event.requestId as string;
      const duration = (event.duration as number) ?? 0;
      const logs = useMockStore.getState().logs;
      const idx = logs.findIndex((l) => l.id === requestId);
      if (idx >= 0) {
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
        if (server) {
          const patch: Partial<MockServerInfo> = { requestsServed: server.requestsServed + 1 };
          const scenarioCount = event.scenarioRequestCount as number | undefined;
          if (scenarioCount !== undefined) patch.scenarioRequestCount = scenarioCount;
          store.updateServer(serverId, patch);
        }
      }
      break;
    }

    case "mock:request:error": {
      const requestId = event.requestId as string;
      const duration = (event.duration as number) ?? 0;
      const logs = useMockStore.getState().logs;
      const idx = logs.findIndex((l) => l.id === requestId);
      if (idx >= 0) {
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
        if (server) {
          store.updateServer(serverId, {
            requestsServed: server.requestsServed + 1,
            errorCount: server.errorCount + 1,
          });
        }
      }
      break;
    }

    case "mock:network:config": {
      const cfg = event.config as Record<string, unknown> | undefined;
      const autoHalted = cfg?.autoHalted === true;

      // If auto-halted, reset both latency and chaos presets
      if (autoHalted) {
        store.updateServer(serverId, {
          latencyPreset: "none",
          latencyStartedAt: null,
          chaosPreset: "none",
          chaosStartedAt: null,
          networkPreset: "none",
          networkConfig: null,
        });
        // Record experiment event
        store.addExperimentEvent({
          id: `halt_${Date.now().toString(36)}`,
          serverId,
          timestamp: Date.now(),
          type: "auto-halted",
          mode: "chaos",
          errorRate: (cfg?.errorRate as number) ?? 0,
          reason: (cfg?.haltReason as string) ?? "stop condition met",
        });
      } else if (cfg) {
        store.updateServer(serverId, {
          networkConfig: cfg as unknown as NetworkConfig,
        });
      }
      break;
    }

    case "mock:experiment:event": {
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
      break;
    }

    default:
      break;
  }
}

/** Preserve client-side hits/avgLatency when incoming routes arrive with zeros */
function mergeRouteStats(
  existing: MockRouteEntry[],
  incoming: MockRouteEntry[],
): MockRouteEntry[] {
  if (existing.length === 0) return incoming;

  const statsMap = new Map<string, { hits: number; avgLatency: number }>();
  for (const r of existing) {
    if (r.hits > 0) {
      statsMap.set(`${r.httpMethod}:${r.group}:${r.endpoint}`, {
        hits: r.hits,
        avgLatency: r.avgLatency,
      });
    }
  }

  if (statsMap.size === 0) return incoming;

  return incoming.map((r) => {
    const stats = statsMap.get(`${r.httpMethod}:${r.group}:${r.endpoint}`);
    if (!stats || r.hits > 0) return r;
    return { ...r, hits: stats.hits, avgLatency: stats.avgLatency };
  });
}

/** Check if an event type belongs to the mock namespace */
export function isMockEvent(type: string): boolean {
  return type.startsWith("mock:");
}
