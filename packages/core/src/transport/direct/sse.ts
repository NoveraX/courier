import { getSourceName } from "../../define/api";
import type { AnyDefinedApi } from "../../define/types";
import { buildDirectSSEUrl, executeSSE } from "../../realtime/caller-sse";
import { beginStream, instrumentSSE } from "../instrument";
import type { SSEFactory } from "../types";
import { addressCall } from "./address";

export interface DirectSSEDefaults {
  headers?: Record<string, string>;
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
  const opts = (api as Record<string, unknown>).options as Record<string, unknown> | undefined;
  const baseURL = (opts?.baseURL as string | undefined) ?? "";
  const groups = opts?.groups as Record<string, Record<string, unknown>> | undefined;
  const { headers: defaultHeaders } = defaults;

  return function subscribeSSE(group, method, variables, options) {
    const prefix =
      ((groups?.[group]?.options as Record<string, unknown> | undefined)?.prefix as string) ?? "";
    // Compose the actual outbound headers (must mirror sse-connection.ts).
    // The fetch layer always adds `Accept: text/event-stream`; merging it
    // here means Studio sees the same headers the wire sees, not just the
    // user-supplied subset.
    const requestHeaders: Record<string, string> = {
      Accept: "text/event-stream",
      ...defaultHeaders,
      ...(options.headers as Record<string, string> | undefined),
    };

    const address = addressCall(groups?.[group]?.[method], method, variables);
    const url = buildDirectSSEUrl(baseURL, prefix, address.path, address.variables);

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
    const instr = beginStream(meta);

    const subscription = executeSSE(
      url,
      requestHeaders,
      undefined,
      instr
        ? (response) => {
            instr.updateMeta({ responseHeaders: headersToRecord(response.headers) });
          }
        : undefined,
    );

    return instrumentSSE(subscription, meta, instr);
  };
}
