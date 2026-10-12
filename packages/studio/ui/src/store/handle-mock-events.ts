/**
 * Public dispatcher for the `mock:*` socket event stream.
 *
 * Owns the event-type → handler routing and re-exports the `isMockEvent`
 * namespace probe. The actual handlers live in two sibling files split
 * by domain:
 *
 * - `handle-mock-server-events.ts` — server lifecycle, routes and
 *   scenario activation.
 * - `handle-store-changes.ts` — the reports of each mock's store.
 * - `handle-mock-request-events.ts` — request lifecycle, network config
 *   and chaos experiment events.
 */

import { str } from "./event-helpers";
import {
  handleExperimentEvent,
  handleNetworkConfig,
  handleRequestEnd,
  handleRequestError,
  handleRequestStart,
} from "./handle-mock-request-events";
import { handleScenarioActive, handleServerConnect } from "./handle-mock-server-events";
import { handleRequestUpload } from "./handle-request-upload";
import { handleStoreChanges } from "./handle-store-changes";
import type { MockEvent } from "./mock-event-types";
import { mockServerOf } from "./mock-server-of";
import { useMockStore } from "./mock-slice";
import { isMockScenarioEntry, readList, readMockRoutes } from "./payload";

/**
 * Route a `mock:*` event to the mock store.
 *
 * @param event - The event
 * @example
 * ```ts
 * handleMockEvent(event);
 * ```
 */
export function handleMockEvent(event: MockEvent): void {
  const store = useMockStore.getState();
  const serverId = str(event.serverId);

  switch (event.type) {
    case "mock:server:connect":
      handleServerConnect(serverId, event);
      break;
    /* A managed mock goes away only when its config entry does; one Studio
       did not start may come back on its own. */
    case "mock:server:disconnect":
      if (mockServerOf(store.servers, serverId)?.managed) store.removeServer(serverId);
      else store.updateServer(serverId, { status: "disconnected" });
      break;
    case "mock:route:list":
      store.setServerRoutes(serverId, readMockRoutes(event.routes) ?? []);
      break;
    case "mock:store:changes":
      handleStoreChanges(serverId, event);
      break;
    case "mock:scenario:list":
      store.setServerScenarios(serverId, readList(event.scenarios, isMockScenarioEntry) ?? []);
      break;
    case "mock:scenario:active":
      handleScenarioActive(serverId, event);
      break;
    case "mock:request:upload":
      handleRequestUpload(serverId, event);
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
