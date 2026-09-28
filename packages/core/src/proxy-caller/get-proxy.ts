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
  defaultHeaders?: Record<string, string>;
  /** The rest of the browser request's init — signal, cache, next, mode, … */
  init: Record<string, unknown>;
  timeout?: number;
  onDownloadProgress?: unknown;
  stream: boolean;
  fetchCtx: {
    onSuccess?: (data: unknown) => void | Promise<void>;
    onError?: (error: HTTPError) => void | Promise<void>;
  };
};

export function handleGetProxy(ctx: GetProxyCtx): Promise<unknown> {
  const searchParams = proxyRouting(ctx.source, ctx.group, ctx.method);

  const variables = encodeWireVariables(ctx.variables);
  if (variables) searchParams[WIRE_VARIABLES_KEY] = variables;

  const serverOptionsStr = JSON.stringify(ctx.serverOptions);
  if (serverOptionsStr !== "{}") {
    searchParams._o = serverOptionsStr;
  }

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
