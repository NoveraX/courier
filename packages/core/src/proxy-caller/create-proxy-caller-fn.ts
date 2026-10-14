import { isFormData, parseEndpointKey } from "../utils/helpers";
import { assertCarriable } from "./assert-carriable";
import { assertJsonVariables } from "./assert-json-variables";
import { fitsInAddress, getProxyQuery, handleGetProxy } from "./get-proxy";
import { inProcessRoute } from "./in-process";
import { buildPostPayload } from "./post-payload";
import { createProxyCancelPrevious } from "./proxy-cancel-previous";
import { proxyRouting } from "./proxy-routing";
import { resolveProxyPath } from "./resolve-path";
import { sendFetch } from "./send-fetch";
import { splitProxyOptions } from "./split-options";
import type { ProxyCallerDefaults, ProxyEndpointKind, UntypedCallerFn } from "./types";

/**
 * The function the proxy transport sends calls through: given a source and a
 * call's options, it sends one endpoint's variables to the server's proxy
 * route and answers with what the server answered.
 *
 * It takes a call as the transport hands it on — the options as a record, the
 * endpoint by its key — so the typed clients in front of it are the one place
 * an API's types live, and nothing here casts a typed chain away.
 *
 * @param defaults - The caller's proxy path, headers, credentials, timeout,
 *   callbacks, the reads a newer call cancels, and whether identical reads
 *   in flight share one request
 * @returns The call function
 * @example
 * ```ts
 * const call = createUntypedProxyCallerFn({ proxyPath: { http: "/api/request" } });
 * await call("api")("users:byId", { id: "1" });
 * ```
 */
export function createUntypedProxyCallerFn(defaults: ProxyCallerDefaults = {}): UntypedCallerFn {
  const {
    proxyPath,
    credentials = "include",
    headers: defaultHeaders,
    timeout: defaultTimeout,
    onError: globalOnError,
    onSuccess: globalOnSuccess,
    coalesce,
  } = defaults;

  const fetchCtx = { onSuccess: globalOnSuccess, onError: globalOnError };
  const cancelling = new Set(defaults.cancelPrevious ?? []);
  const cancels = cancelling.size > 0 ? createProxyCancelPrevious() : undefined;

  return (source, options) => {
    const callSignal = options?.signal instanceof AbortSignal ? options.signal : undefined;

    async function send(
      endpoint: string,
      variables: unknown,
      signal: AbortSignal | undefined,
      kind: ProxyEndpointKind | undefined,
    ): Promise<unknown> {
      assertCarriable(variables);
      if (!isFormData(variables)) assertJsonVariables(variables);
      const { group, method } = parseEndpointKey(endpoint);
      /* Found before the call first waits, as some frameworks know the
         request being served only until then. What finding it fails with —
         a render a framework stops — is the call's failure, as it came. */
      const route = inProcessRoute(proxyPath, source);
      const served = route ? await route.incoming : undefined;
      // Lazy resolution: in SSR contexts the caller may be constructed in
      // Node where `globalThis.location` is undefined; resolving here guarantees
      // we read the live origin at the moment the request is actually sent.
      const url = route?.url ?? resolveProxyPath("http", proxyPath);

      const call = splitProxyOptions(options, {
        headers: defaultHeaders,
        credentials,
        timeout: defaultTimeout,
      });
      const local = {
        ...(coalesce === false && { coalesce }),
        ...call.init,
        cache: call.cache,
        next: call.next,
        signal,
        ...(route && { transport: route.transport(served) }),
      };

      if (
        goesAsGet(call, { url, source, group, method, variables, reads: kind === "cached-read" })
      ) {
        return handleGetProxy({
          url,
          source,
          group,
          method,
          variables,
          serverOptions: call.server,
          credentials: call.credentials,
          defaultHeaders: call.headers,
          init: local,
          timeout: call.timeout,
          onDownloadProgress: call.onDownloadProgress,
          stream: call.stream,
          fetchCtx,
        });
      }

      return sendFetch(
        "post",
        url,
        {
          ...local,
          /* The call's own query and body, which nothing a caller passes may replace. */
          searchParams: proxyRouting(source, group, method),
          ...buildPostPayload(variables, call.server),
          /* A read that goes as a POST — its variables too long for an address, or
             sensitive — is joined as the read it is; one the client knows nothing of is not. */
          reads: kind === "cached-read" || kind === "read",
          credentials: call.credentials,
          onUploadProgress: call.onUploadProgress,
          onDownloadProgress: call.onDownloadProgress,
          timeout: call.timeout,
          headers: call.headers,
        },
        { ...fetchCtx, stream: call.stream, raw: call.server.rawData === true },
      );
    }
    /* A newer call cancels an older one only for a read, or one the client knows nothing of: a
       cancelled write has usually been applied by the server while its caller is told it was not. */
    return (endpoint, variables, kind) => {
      if (!cancels || kind === "mutation" || !cancelling.has(pathOf(endpoint))) {
        return send(endpoint, variables, callSignal, kind);
      }
      return cancels.run(`${source}:${endpoint}`, callSignal, (signal) =>
        send(endpoint, variables, signal, kind),
      );
    };
  };
}

/**
 * Whether a call goes to the proxy as GET: when it asks for GET, or when it
 * does not say and the endpoint reads. A body — form data, an upload whose
 * progress is watched — goes as POST whatever was asked, and so does a read
 * that did not ask for GET and whose variables would make the address too
 * long for the servers and CDNs on the way.
 */
function goesAsGet(
  call: {
    proxyMethod: "GET" | "POST" | undefined;
    onUploadProgress: unknown;
    server: Record<string, unknown>;
  },
  target: {
    url: string;
    source: string;
    group: string | undefined;
    method: string;
    variables: unknown;
    reads: boolean;
  },
): boolean {
  if (isFormData(target.variables) || call.onUploadProgress) return false;
  if (call.proxyMethod !== undefined) return call.proxyMethod === "GET";
  if (!target.reads) return false;
  return fitsInAddress(target.url, getProxyQuery({ ...target, serverOptions: call.server }));
}

/* An endpoint as the API names it in `cancelPrevious`: `users.search` for the proxy's `users:search`. */
function pathOf(endpoint: string): string {
  const { group, method } = parseEndpointKey(endpoint);
  return group ? `${group}.${method}` : method;
}
