/**
 * Wire mock server request lifecycle hooks to IPC events for Studio Logs tab.
 */

import type { MockServer } from "../server/create-mock-server";
import { checkAutoHalt } from "./network-commands";
import { send, sendStoreSnapshot } from "./worker-ipc";
import { trackWritesInFlight } from "./writes-in-flight";

export function wireRequestHooks(server: MockServer): void {
  const writes = trackWritesInFlight();
  server.requestHooks.onStart = (
    id,
    httpMethod,
    path,
    group,
    endpoint,
    variables,
    requestHeaders,
  ) => {
    writes.start(id, httpMethod);
    send({
      type: "event",
      event: {
        type: "mock:request:start",
        requestId: id,
        httpMethod,
        path,
        group,
        endpoint,
        variables,
        requestHeaders,
      },
    });
  };
  server.requestHooks.onEnd = (
    id,
    status,
    data,
    duration,
    latencyInjected,
    scenarioState,
    responseHeaders,
  ) => {
    send({
      type: "event",
      event: {
        type: "mock:request:end",
        requestId: id,
        status,
        data,
        duration,
        latencyInjected,
        scenarioState,
        responseHeaders,
      },
    });
    if (writes.end(id)) sendStoreSnapshot(server);
    checkAutoHalt(server);
  };
  server.requestHooks.onError = (id, status, message, duration) => {
    send({
      type: "event",
      event: { type: "mock:request:error", requestId: id, status, message, duration },
    });
    if (writes.end(id)) sendStoreSnapshot(server);
    checkAutoHalt(server);
  };
}
