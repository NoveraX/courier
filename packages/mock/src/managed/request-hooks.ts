/**
 * Wire mock server request lifecycle hooks to IPC events for Studio Logs tab.
 */

import type { MockServer } from "../server/create-mock-server";
import type { StoreFeed } from "./store-feed";
import { send } from "./worker-ipc";
import { trackWritesInFlight } from "./writes-in-flight";

export function wireRequestHooks(server: MockServer, feed: StoreFeed): void {
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
        /* What answers it, read as it arrives: a later scenario does not rewrite it. */
        source: server.getRouteSource(group, endpoint),
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
    if (writes.end(id)) feed.changed();
  };
  server.requestHooks.onError = (id, status, message, duration) => {
    send({
      type: "event",
      event: { type: "mock:request:error", requestId: id, status, message, duration },
    });
    if (writes.end(id)) feed.changed();
  };
}
