/**
 * A stream another server serves, relayed through this one: the server opens
 * it where the source's definition says, as a direct caller would, and hands
 * each event on. A browser reaches a third party's stream through its own
 * server, with no CORS to configure and no credentials of its own to hold.
 */

import type { SSEHandler } from "../realtime/types";
import { streamRequest } from "../transport/direct/stream-request";
import { layerHeaders } from "../utils/layer-headers";

/**
 * The handler that relays a stream another server serves.
 *
 * The upstream is opened with the source's `headers`, then what the proxy
 * sends on every call — the request headers its policy lets through and
 * whatever the source's middleware set — and the `Last-Event-ID` the client
 * resumes from. Its events are handed on as they came, ids and names
 * included; a dropped upstream connection is reopened, resuming from the
 * last id, while the client's stays open. The relay ends when the upstream
 * stream ends, fails as it fails, and closes the upstream when the client
 * leaves.
 *
 * @param api - The source the stream belongs to
 * @param group - The stream's group, empty for none
 * @param method - The stream's name
 * @returns The handler, run as a served stream's is
 * @example
 * ```ts
 * const handler = relayStream(sources.openai, "", "events");
 * createSSEStream(handler, sseCtx, streamOptions);
 * ```
 */
export function relayStream(
  api: object,
  group: string,
  method: string,
): SSEHandler<unknown, unknown> {
  return async function* relay(ctx) {
    /* The stream client loads with the first relayed stream, not with every
       server that serves the proxy. */
    const [{ subscribeSSE }, { readStreamData }] = await Promise.all([
      import("../realtime/sse"),
      import("../realtime/sse/stream-data"),
    ]);
    const request = streamRequest(api, group, method, ctx.variables);
    yield* subscribeSSE(request.url, {
      headers: layerHeaders({ Accept: "text/event-stream" }, request.sourceHeaders, ctx.headers),
      parse: readStreamData,
      signal: ctx.signal,
      ...(ctx.lastEventId !== undefined && { lastEventId: ctx.lastEventId }),
    });
  };
}
