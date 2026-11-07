import { serverCapability } from "../capabilities/registry";
import type { Context } from "../http-client/types";
import type { CallPurpose, MiddlewareContext } from "../middleware/types";
import { forwardedRequestHeaders } from "./forwarded-request-headers";
import { headersToObject } from "./helpers";
import { mergeHeaders } from "./merge-headers";
import { agentOf } from "./one-users-call";
import { ownField, ownFields } from "./own";
import { randomId } from "./random-id";

export interface MiddlewareContextInput {
  source: unknown;
  group: unknown;
  method: unknown;
  variables: unknown;
  /** Headers the caller passed explicitly, if any. */
  baseHeaders?: unknown;
  context?: Context | undefined;
  /** The source's options, as the call read them once */
  sourceOptions: { headers?: HeadersInit | undefined } | undefined;
  requestId: string;
  transport?: "http" | "sse" | "ws" | undefined;
  /** The header names the source and the endpoint carry across the proxy, as `namedHeadersOf` reads them */
  namedHeaders: readonly string[];
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
 * or the endpoint names, with the caller's own on top. The
 * `x-forwarded-for` chain goes on once the session has put its own, by
 * {@link carryForwardedFor}.
 *
 * @param input - The call, the source it resolved to, and what the caller gave
 * @returns The middleware context
 *
 * @example
 * ```ts
 * const ctx = buildMiddlewareContext({ source: "api", group: "users", method: "list",
 *   variables: undefined, sourceOptions: api.options, namedHeaders: [], requestId: "" });
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
    sourceOptions,
    requestId,
    transport,
    namedHeaders,
    kind,
    signal,
    idempotencyHeader: keyHeader,
    purpose,
  } = ownFields(input);
  const { req: nextRequest, headers: nextHeaders } = context || {};
  const agent = agentOf(context);
  const mergedNextHeaders = {
    ...headersToObject(nextRequest?.headers),
    ...headersToObject(nextHeaders),
  };
  /* The caller's own headers go on top of the ones it forwards. A header it
     set — a service token for a backend the end user may not reach — is its
     explicit choice, which the incoming request's copy must not replace;
     nor may that copy replace one the API sets in its `headers`. */
  const newHeaders = forwardedRequestHeaders(
    mergedNextHeaders,
    keyHeader ? [...namedHeaders, keyHeader] : namedHeaders,
    ownField(sourceOptions, "headers"),
    String(source),
  );
  const forwarded = new Set(newHeaders.keys());
  mergeHeaders(baseHeaders as HeadersInit | Record<string, string | undefined> | undefined).forEach(
    (value, name) => {
      newHeaders.set(name, value);
      forwarded.delete(name);
    },
  );
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
    ...(purpose && { purpose }),
    ...(agent && { agent }),
    ...(idempotencyKey && { idempotencyKey }),
    _requestId: requestId || undefined,
    _forwarded: forwarded,
  };
}

/**
 * The `X-Forwarded-For` a call made on behalf of the request its context
 * names carries upstream, as the server reads it off that request. A page
 * serves no request, and lends none.
 *
 * @param context - The call's context
 * @returns The chain, once read; `undefined` for a call that names no request, or where no server lends one
 * @example
 * ```ts
 * const chain = forwardedChainOf(context);
 * if (chain !== undefined) carryForwardedFor(middlewareCtx.headers, await chain);
 * ```
 */
export function forwardedChainOf(
  context: Context | undefined,
): Promise<string | undefined> | undefined {
  const request = context?.req;
  return request === undefined ? undefined : serverCapability("session")?.forwardedFor(request);
}

/**
 * Put a request's `X-Forwarded-For` chain on a call made for it, where
 * nothing set the header: a source that names it takes the caller's copy,
 * server code that sets one keeps its own, and the API's `forward` may
 * write it otherwise — so the chain goes on after the session's headers.
 *
 * @param headers - The headers the call is sent with
 * @param chain - The chain, when anything recorded an address
 * @example
 * ```ts
 * carryForwardedFor(middlewareCtx.headers, forwardedFor(request));
 * ```
 */
export function carryForwardedFor(headers: Headers, chain: string | undefined): void {
  if (chain && !headers.has("x-forwarded-for")) headers.set("x-forwarded-for", chain);
}
