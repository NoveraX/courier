import type { HTTPError } from "../errors";
import { encodeWireVariables, WIRE_VARIABLES_KEY } from "../utils/wire-variables";
import { sendFetch } from "./send-fetch";

export type GetProxyCtx = {
  url: string;
  source: string;
  group: string | undefined;
  method: string;
  variables: Record<string, unknown> | undefined;
  serverOptions: Record<string, unknown>;
  credentials: RequestCredentials;
  defaultHeaders?: Record<string, string>;
  signal?: AbortSignal | null;
  timeout?: number;
  cache?: unknown;
  next?: Record<string, unknown>;
  onDownloadProgress?: unknown;
  stream: boolean;
  fetchCtx: {
    onSuccess?: (data: unknown) => void | Promise<void>;
    onError?: (error: HTTPError) => void | Promise<void>;
  };
};

export function handleGetProxy(ctx: GetProxyCtx): Promise<unknown> {
  const searchParams: Record<string, string> = { _s: ctx.source, _m: ctx.method };
  if (ctx.group) searchParams._g = ctx.group;

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
      searchParams,
      credentials: ctx.credentials,
      headers: ctx.defaultHeaders,
      signal: ctx.signal,
      timeout: ctx.timeout,
      cache: ctx.cache,
      next: ctx.next,
      onDownloadProgress: ctx.onDownloadProgress,
    },
    {
      ...ctx.fetchCtx,
      stream: ctx.stream,
      requestPayload: {
        json: {
          source: ctx.source,
          group: ctx.group,
          method: ctx.method,
          variables: ctx.variables,
        },
      },
    },
  );
}
