import type { Context } from "../http-client/types";
import type { MiddlewareContext } from "../middleware/types";
import { namedHeadersOf } from "./execute-resolve";
import { forwardedFor } from "./forwarded-for";
import { headersToObject } from "./helpers";
import { filterHeaders, mergeHeaders } from "./merge-headers";

export interface MiddlewareContextInput {
  source: unknown;
  group: unknown;
  method: unknown;
  variables: unknown;
  /** Headers the caller passed explicitly, if any. */
  baseHeaders?: unknown;
  context?: Context;
  dataSource: Record<string, unknown>;
  requestId: string;
  transport?: "http" | "sse" | "ws";
  endpointAllowedHeaders?: readonly string[];
  /** Whether the endpoint reads or writes, from its schema. */
  kind?: "query" | "mutation";
  /** Fires when the caller stops waiting for the call. */
  signal?: AbortSignal;
}

/**
 * Build the context every middleware of a call sees.
 *
 * The headers start from those the incoming request carries and the source
 * or the endpoint names, with the caller's own on top, and an
 * `x-forwarded-for` chain where nothing set one.
 *
 * @param input - The call, the source it resolved to, and what the caller gave
 * @returns The middleware context
 *
 * @example
 * ```ts
 * const ctx = buildMiddlewareContext({ source: "api", group: "users", method: "list",
 *   variables: undefined, dataSource, requestId: "" });
 * ```
 */
export function buildMiddlewareContext(input: MiddlewareContextInput): MiddlewareContext {
  const {
    source,
    group,
    method,
    variables,
    baseHeaders,
    context,
    dataSource,
    requestId,
    transport,
    endpointAllowedHeaders,
    kind,
    signal,
  } = input;
  const { req: nextRequest, headers: nextHeaders } = context || {};
  const mergedNextHeaders = {
    ...headersToObject(nextRequest?.headers),
    ...headersToObject(nextHeaders),
  };
  const allowedHeaders = namedHeadersOf(dataSource, endpointAllowedHeaders);
  /* The caller's own headers go on top of the ones it forwards. A header it
     set — a service token for a backend the end user may not reach — is its
     explicit choice, and the incoming request's copy used to replace it. */
  const newHeaders = filterHeaders(mergedNextHeaders, allowedHeaders);
  mergeHeaders(baseHeaders as HeadersInit | Record<string, string | undefined> | undefined).forEach(
    (value, name) => {
      newHeaders.set(name, value);
    },
  );
  /* Set only where nothing already did: a source that names the header takes
     the caller's copy, and server code that sets one keeps its own. */
  const chain = nextRequest && !newHeaders.has("x-forwarded-for") && forwardedFor(nextRequest);
  if (chain) newHeaders.set("x-forwarded-for", chain);

  return {
    source: String(source),
    group: group ? String(group) : undefined,
    method: String(method),
    variables,
    headers: newHeaders,
    transport,
    request: nextRequest,
    kind,
    signal,
    _requestId: requestId || undefined,
  };
}
