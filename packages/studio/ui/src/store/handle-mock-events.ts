/**
 * Public dispatcher for the `mock:*` socket event stream.
 *
 * Owns the event-type → handler routing and re-exports the `isMockEvent`
 * namespace probe. The actual handlers live in two sibling files split
 * by domain:
 *
 * - `handle-mock-server-events.ts` — server lifecycle, routes, store
 *   snapshots and scenario activation.
 * - `handle-mock-request-events.ts` — request lifecycle, network config
 *   and chaos experiment events.
 */

import type { MockCollectionEntry, MockScenarioEntry } from "./mock-slice-types";
import type { MockEvent } from "./mock-event-types";

import { useMockStore } from "./mock-slice";
import {
  handleScenarioActive,
  handleServerConnect,
  handleStoreChange,
} from "./handle-mock-server-events";
import {
  handleExperimentEvent,
  handleNetworkConfig,
  handleRequestEnd,
  handleRequestError,
  handleRequestStart,
} from "./handle-mock-request-events";

/** Route mock:* events to the mock Zustand store */
export function handleMockEvent(event: MockEvent): void {
  const store = useMockStore.getState();
  const serverId = event.serverId as string;

  switch (event.type) {
    case "mock:server:connect":
      handleServerConnect(serverId, event);
      break;
    case "mock:server:disconnect":
      store.updateServer(serverId, { status: "disconnected" });
      break;
    case "mock:route:list":
      store.setServerRoutes(serverId, (event.routes as never[]) ?? []);
      break;
    case "mock:store:snapshot":
      store.setServerCollections(serverId, (event.collections as MockCollectionEntry[]) ?? []);
      break;
    case "mock:store:change":
      handleStoreChange(serverId, event);
      break;
    case "mock:scenario:list":
      store.setServerScenarios(serverId, (event.scenarios as MockScenarioEntry[]) ?? []);
      break;
    case "mock:scenario:active":
      handleScenarioActive(serverId, event);
      break;
    case "mock:request:start":
      handleRequestStart(serverId, event);
      break;
    case "mock:request:end":
      handleRequestEnd(serverId, event);
      break;
    case "mock:request:error":
      handleRequestError(serverId, event);
      break;
    case "mock:network:config":
      handleNetworkConfig(serverId, event);
      break;
    case "mock:experiment:event":
      handleExperimentEvent(serverId, event);
      break;
    default:
      break;
  }
}

/** Check if an event type belongs to the mock namespace */
export function isMockEvent(type: string): boolean {
  return type.startsWith("mock:");
}
