/**
 * A stream another server serves, relayed through this one: the server opens
 * it where the source's definition says, as a direct caller would, and hands
 * each event on. A browser reaches a third party's stream through its own
 * server, with no CORS to configure and no credentials of its own to hold.
 */

import type { PlatformFetch } from "../http-client/source-transport";
import type { SSEHandler } from "../realtime/types";
import { streamInitOf, transportOf } from "../transport/direct/source-transport";
import { streamRequest } from "../transport/direct/stream-request";
import { fetchWithinOrigin } from "../utils/fetch-within-origin";
import { layerHeaders } from "../utils/layer-headers";

/**
 * The handler that relays a stream another server serves.
 *
 * The upstream is opened with the source's `headers`, then what the proxy
 * sends on every call — the request headers its policy lets through and
 * whatever the source's middleware set — and the `Last-Event-ID` the client
 * resumes from; through the `fetch` the stream's group or its source names,
 * given what their options give a request that stays open — the
 * `dispatcher` that carries a client certificate or a proxy, the group's
 * over the source's. As the proxy's calls do, it follows an upstream
 * redirect only while it stays on the upstream's origin, so the source's
 * credentials never reach another host — a redirect elsewhere refuses the
 * stream — unless the source names a `redirect` mode of its own. Its events are handed on as they
 * came, ids and names included; a dropped upstream connection is reopened,
 * resuming from the last id, while the client's stays open. The relay ends when the upstream
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
    const transport = transportOf(api, group);
    const init = streamInitOf(api, transport);
    const send = relayFetch(transport.fetch, init);
    yield* subscribeSSE(request.url, {
      headers: layerHeaders({ Accept: "text/event-stream" }, request.sourceHeaders, ctx.headers),
      parse: readStreamData,
      signal: ctx.signal,
      ...(ctx.lastEventId !== undefined && { lastEventId: ctx.lastEventId }),
      ...(send && { fetch: send }),
      ...(Object.keys(init).length > 0 && { beforeConnect: () => ({ init }) }),
    });
  };
}

/* What opens each upstream connection: the source's own redirect mode when it names one,
   as its calls keep it; else every hop stays on the upstream's origin. */
function relayFetch(send: PlatformFetch | undefined, init: RequestInit): PlatformFetch | undefined {
  if (init.redirect !== undefined) return send;
  return (url, request) => fetchWithinOrigin(url, request, send);
}
