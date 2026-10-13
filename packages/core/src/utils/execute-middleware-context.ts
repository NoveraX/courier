import type { Context } from "../http-client/types";
import type { CallPurpose, MiddlewareContext } from "../middleware/types";
import { namedHeadersOf } from "./execute-resolve";
import { forwardedFor } from "./forwarded-for";
import { forwardedRequestHeaders } from "./forwarded-request-headers";
import { headersToObject } from "./helpers";
import { mergeHeaders } from "./merge-headers";
import { randomId } from "./random-id";

export interface MiddlewareContextInput {
  source: unknown;
  group: unknown;
  method: unknown;
  variables: unknown;
  /** Headers the caller passed explicitly, if any. */
  baseHeaders?: unknown;
  context?: Context | undefined;
  dataSource: Record<string, unknown>;
  requestId: string;
  transport?: "http" | "sse" | "ws" | undefined;
  endpointAllowedHeaders?: readonly string[] | undefined;
  /** Whether the endpoint reads or writes, from its schema. */
  kind?: "query" | "mutation" | undefined;
  /** Fires when the caller stops waiting for the call. */
  signal?: AbortSignal | undefined;
  /** The header the endpoint sends a key in, one per call, for the upstream to deduplicate by. */
  idempotencyHeader?: string | undefined;
  /** What the call is, when it is a request the session makes rather than an endpoint's */
  purpose?: CallPurpose | undefined;
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
  const keyHeader = input.idempotencyHeader;
  const allowedHeaders = namedHeadersOf(dataSource, [
    ...(endpointAllowedHeaders ?? []),
    ...(keyHeader ? [keyHeader] : []),
  ]);
  /* The caller's own headers go on top of the ones it forwards. A header it
     set — a service token for a backend the end user may not reach — is its
     explicit choice, which the incoming request's copy must not replace;
     nor may that copy replace one the API sets in its `headers`. */
  const ownHeaders = (dataSource.options as { headers?: HeadersInit } | undefined)?.headers;
  const newHeaders = forwardedRequestHeaders(
    mergedNextHeaders,
    allowedHeaders,
    ownHeaders,
    String(source),
  );
  const forwarded = new Set(newHeaders.keys());
  mergeHeaders(baseHeaders as HeadersInit | Record<string, string | undefined> | undefined).forEach(
    (value, name) => {
      newHeaders.set(name, value);
      forwarded.delete(name);
    },
  );
  /* Set only where nothing already did: a source that names the header takes
     the caller's copy, and server code that sets one keeps its own. */
  const chain = nextRequest && !newHeaders.has("x-forwarded-for") && forwardedFor(nextRequest);
  if (chain) newHeaders.set("x-forwarded-for", chain);
  /* One key per call, set before any middleware: every attempt a retry makes
     carries it, so the upstream applies the write once. A caller's own key —
     server code's, or the browser's through the proxy — is kept. */
  if (keyHeader && !newHeaders.has(keyHeader)) newHeaders.set(keyHeader, randomId());
  const idempotencyKey = keyHeader ? (newHeaders.get(keyHeader) ?? undefined) : undefined;

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
    ...(input.purpose && { purpose: input.purpose }),
    ...(context?.agent && { agent: context.agent }),
    ...(idempotencyKey && { idempotencyKey }),
    _requestId: requestId || undefined,
    _forwarded: forwarded,
  };
}
