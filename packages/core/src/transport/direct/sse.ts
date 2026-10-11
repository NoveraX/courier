import { getSourceName } from "../../define/api";
import type { AnyDefinedApi } from "../../define/types";
import { subscribeSSE } from "../../realtime/sse";
import { readStreamData } from "../../realtime/sse/stream-data";
import { layerHeaders } from "../../utils/layer-headers";
import { beginStream, instrumentSSE } from "../instrument";
import type { SSEFactory } from "../types";
import { assertDirectlyReachable } from "./assert-reachable";
import { transportOf } from "./source-transport";
import { streamConnection } from "./stream-connection";
import { streamRequest } from "./stream-request";
import { streamSessionOf } from "./stream-session";
import { studioRequestIdOption } from "./studio-request-option";

export interface DirectSSEDefaults {
  headers?: Record<string, string> | undefined;
}

function headersToRecord(h: Headers): Record<string, string> {
  const rec: Record<string, string> = {};
  h.forEach((v, k) => {
    rec[k] = v;
  });
  return rec;
}

/**
 * Create a direct-mode SSE factory that connects directly to the backend's
 * SSE endpoint via baseURL + group prefix + the path the endpoint addressed.
 *
 * URL pattern: `{baseURL}/{groupPrefix}/{path}?{variables}`, where the path is
 * worked out from each call's variables and takes the `:params` it names.
 *
 * Used by createCaller (universal mode) and createQueryCaller (React direct mode).
 * A stream this process serves with `.implement()` has no address at
 * `baseURL`, so calling one throws `DIRECT_CALL_TO_SERVED_ENDPOINT`.
 *
 * Browser-side studio instrumentation: when studio hooks are installed, each
 * subscription emits stream:open / stream:message / stream:close / stream:error
 * with `mode: "direct"` so streams from direct callers appear in Studio.
 * Response headers are captured asynchronously via the `onResponse` callback
 * and merged into the existing entry via `instr.updateMeta`.
 */
export function createDirectSSEFactory(
  api: AnyDefinedApi,
  defaults: DirectSSEDefaults = {},
): SSEFactory {
  const sourceName = getSourceName(api) ?? "_";
  const { headers: defaultHeaders } = defaults;

  return function openStream(group, method, variables, options) {
    assertDirectlyReachable(api, group, method);
    const request = streamRequest(api, group, method, variables);
    // Compose the actual outbound headers (must mirror sse-connection.ts).
    // The fetch layer always adds `Accept: text/event-stream`; merging it
    // here means Studio sees the same headers the wire sees, not just the
    // user-supplied subset.
    const requestHeaders = layerHeaders(
      { Accept: "text/event-stream" },
      request.sourceHeaders,
      defaultHeaders,
      options.headers,
    );
    const url = request.url;

    // Open the studio stream up-front so we have an `instr` handle whose
    // `updateMeta` can be called from the `onResponse` callback when the
    // server replies.
    const meta = {
      source: sourceName,
      group,
      method,
      transport: "sse" as const,
      mode: "direct" as const,
      requestHeaders,
    };
    const instr = beginStream(meta, studioRequestIdOption(options));
    const transport = transportOf(api, group, options);
    const connection = streamConnection(api, streamSessionOf(options), transport);

    const send = transport.fetch;
    const subscription = subscribeSSE(url, {
      headers: requestHeaders,
      parse: readStreamData,
      ...(send && { fetch: send }),
      ...(connection && {
        beforeConnect: async () => {
          const opened = await connection.beforeConnect();
          /* Studio shows what the connection sent, the session's headers too. */
          instr?.updateMeta({ requestHeaders: layerHeaders(opened.headers, requestHeaders) });
          return opened;
        },
      }),
      ...((instr || connection) && {
        onResponse: (response: Response) => {
          connection?.keepCookies(response);
          instr?.updateMeta({ responseHeaders: headersToRecord(response.headers) });
        },
      }),
    });

    return instrumentSSE(subscription, meta, instr);
  };
}
