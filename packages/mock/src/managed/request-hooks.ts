/**
 * Wire mock server request lifecycle hooks to IPC events for Studio Logs tab.
 * A body too large for an event travels as a part of it, and the mock keeps
 * the whole for a page that asks.
 */

import { carriedBody } from "@noverax/courier/internal";
import { describedUploads } from "./described-uploads";
import type { ServedMock } from "./types";
import { send } from "./worker-ipc";
import { trackWritesInFlight } from "./writes-in-flight";

export function wireRequestHooks({ server, feed, bodies }: ServedMock): void {
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
    const sent = carriedBody(describedUploads(variables));
    bodies.keep(id, "request", sent);
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
        variables: sent.value,
        ...(sent.whole && { variablesCutFrom: sent.whole.bytes }),
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
    const answered = carriedBody(data);
    bodies.keep(id, "response", answered);
    send({
      type: "event",
      event: {
        type: "mock:request:end",
        requestId: id,
        status,
        data: answered.value,
        ...(answered.whole && { dataCutFrom: answered.whole.bytes }),
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
