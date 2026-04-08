/**
 * Wire mock server request lifecycle hooks to IPC events for Studio Logs tab.
 */

import type { MockServer } from "../server/create-mock-server";
import { checkAutoHalt } from "./network-commands";
import { send } from "./worker-ipc";

export function wireRequestHooks(server: MockServer): void {
  server.requestHooks.onStart = (
    id,
    httpMethod,
    path,
    group,
    endpoint,
    variables,
    requestHeaders,
  ) => {
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
    checkAutoHalt(server);
  };
  server.requestHooks.onError = (id, status, message, duration) => {
    send({
      type: "event",
      event: { type: "mock:request:error", requestId: id, status, message, duration },
    });
    checkAutoHalt(server);
  };
}
