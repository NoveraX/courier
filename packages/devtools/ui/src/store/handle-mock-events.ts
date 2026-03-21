import { useMockStore } from "./mock-slice";

import type { MockCollectionEntry, MockRouteEntry, ProcessStatus } from "./mock-slice";

type MockEvent = Record<string, unknown>;

/** Route mock:* events to the mock Zustand store */
export function handleMockEvent(event: MockEvent): void {
  const store = useMockStore.getState();
  const serverId = event.serverId as string;

  switch (event.type) {
    case "mock:server:connect": {
      const existing = useMockStore.getState().servers[serverId];
      if (existing) {
        // Reconnect — update stats, preserve client-side state (networkPreset)
        store.updateServer(serverId, {
          status: "connected",
          startedAt: (event.startedAt as number) ?? existing.startedAt,
          routeCount: (event.routeCount as number) ?? 0,
          collectionCount: (event.collectionCount as number) ?? 0,
          recordCount: (event.recordCount as number) ?? 0,
          requestsServed: (event.requestsServed as number) ?? 0,
          errorCount: (event.errorCount as number) ?? 0,
          activeScenario: (event.activeScenario as string) ?? null,
          availableScenarios: (event.availableScenarios as string[]) ?? [],
          collections: (event.collections as MockCollectionEntry[]) ?? existing.collections,
          routes: (event.routes as MockRouteEntry[]) ?? existing.routes,
          processStatus: (event.processStatus as ProcessStatus) ?? existing.processStatus,
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
          errorCount: (event.errorCount as number) ?? 0,
          activeScenario: (event.activeScenario as string) ?? null,
          availableScenarios: (event.availableScenarios as string[]) ?? [],
          networkPreset: "none",
          managed: (event.managed as boolean) ?? false,
          processStatus: (event.processStatus as ProcessStatus) ?? "running",
          origin: (event.origin as "devtools" | "external") ?? "external",
          filePath: (event.filePath as string) ?? undefined,
          collections: (event.collections as MockCollectionEntry[]) ?? [],
          routes: (event.routes as MockRouteEntry[]) ?? [],
          scenarios: [],
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

    case "mock:scenario:active":
      store.updateServer(serverId, {
        activeScenario: (event.scenario as string) ?? null,
      });
      break;

    case "mock:request:start":
      store.addLog({
        id: (event.requestId as string) ?? `${Date.now()}`,
        serverId,
        timestamp: (event.timestamp as number) ?? Date.now(),
        httpMethod: (event.httpMethod as string) ?? "GET",
        path: (event.path as string) ?? "",
        group: (event.group as string) ?? "",
        endpoint: (event.endpoint as string) ?? "",
      });
      break;

    case "mock:request:end": {
      const requestId = event.requestId as string;
      const logs = useMockStore.getState().logs;
      const idx = logs.findIndex((l) => l.id === requestId);
      if (idx >= 0) {
        const updated = [...logs];
        updated[idx] = {
          ...updated[idx]!,
          status: (event.status as number) ?? 200,
          duration: (event.duration as number) ?? 0,
        };
        useMockStore.setState({ logs: updated });
      }
      break;
    }

    case "mock:request:error": {
      const requestId = event.requestId as string;
      const logs = useMockStore.getState().logs;
      const idx = logs.findIndex((l) => l.id === requestId);
      if (idx >= 0) {
        const updated = [...logs];
        updated[idx] = {
          ...updated[idx]!,
          status: (event.status as number) ?? 500,
          duration: (event.duration as number) ?? 0,
          error: (event.message as string) ?? "Unknown error",
        };
        useMockStore.setState({ logs: updated });
      }
      break;
    }

    case "mock:network:config":
      store.updateServer(serverId, {
        networkPreset: (event.preset as "none" | "3g" | "flaky" | "down") ?? "none",
      });
      break;

    default:
      break;
  }
}

/** Check if an event type belongs to the mock namespace */
export function isMockEvent(type: string): boolean {
  return type.startsWith("mock:");
}
