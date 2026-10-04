import type { HTTPError } from "../errors";
import type { WebCredentials } from "../http-client/web-types";
import { encodeWireVariables, WIRE_VARIABLES_KEY } from "../utils/wire-variables";
import { proxyRouting } from "./proxy-routing";
import { sendFetch } from "./send-fetch";

export type GetProxyCtx = {
  url: string;
  source: string;
  group: string | undefined;
  method: string;
  variables: unknown;
  serverOptions: Record<string, unknown>;
  credentials: WebCredentials;
  defaultHeaders?: Record<string, string> | undefined;
  /** The rest of the browser request's init — signal, cache, next, mode, … */
  init: Record<string, unknown>;
  timeout?: number | undefined;
  onDownloadProgress?: unknown;
  stream: boolean;
  fetchCtx: {
    onSuccess?: ((data: unknown) => void | Promise<void>) | undefined;
    onError?: ((error: HTTPError) => void | Promise<void>) | undefined;
  };
};

export function handleGetProxy(ctx: GetProxyCtx): Promise<unknown> {
  const searchParams = getProxyQuery(ctx);

  return sendFetch(
    "get",
    ctx.url,
    {
      ...ctx.init,
      /* The call's own query, which nothing a caller passes may replace. */
      searchParams,
      credentials: ctx.credentials,
      headers: ctx.defaultHeaders,
      timeout: ctx.timeout,
      onDownloadProgress: ctx.onDownloadProgress,
    },
    {
      ...ctx.fetchCtx,
      stream: ctx.stream,
      /* Without it a `.raw` call over GET kept its headers as a plain object. */
      raw: ctx.serverOptions.rawData === true,
    },
  );
}

/* The longest address a read goes to as GET; one longer goes as POST. Some
   servers and CDNs refuse an address past 8 KB, a few past 2 KB. */
const MAX_GET_ADDRESS = 2_048;

/**
 * The query a GET to the proxy carries: the endpoint's routing, its variables
 * as JSON, and the call's options.
 *
 * @param ctx - The call
 * @returns The query's fields
 * @example
 * ```ts
 * getProxyQuery({ source: "api", group: "users", method: "search", variables: { q: "ada" }, serverOptions: {} });
 * // → { _s: "api", _g: "users", _m: "search", _v: '{"q":"ada"}' }
 * ```
 */
export function getProxyQuery(
  ctx: Pick<GetProxyCtx, "source" | "group" | "method" | "variables" | "serverOptions">,
): Record<string, string> {
  const searchParams = proxyRouting(ctx.source, ctx.group, ctx.method);
  const variables = encodeWireVariables(ctx.variables);
  if (variables) searchParams[WIRE_VARIABLES_KEY] = variables;
  const serverOptions = JSON.stringify(ctx.serverOptions);
  if (serverOptions !== "{}") searchParams._o = serverOptions;
  return searchParams;
}

/**
 * Whether a call fits in the address of a GET to the proxy.
 *
 * @param url - The proxy route
 * @param query - Its query, from {@link getProxyQuery}
 * @returns Whether the whole address is within the limit
 * @example
 * ```ts
 * fitsInAddress("https://app.example.com/api/request", getProxyQuery(call)); // true for a short search
 * ```
 */
export function fitsInAddress(url: string, query: Record<string, string>): boolean {
  return url.length + 1 + new URLSearchParams(query).toString().length <= MAX_GET_ADDRESS;
}
