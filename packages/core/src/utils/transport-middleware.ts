/**
 * Run an endpoint's middleware for a transport that does not go through
 * `executeRequest`.
 *
 * SSE, WebSocket and the in-process streams each grew their own copy of this,
 * and each copy read only the middleware declared on the *source*. An endpoint
 * that declared its own — an authorization check, a tenant guard, a retry
 * policy — had it silently skipped on exactly the long-lived transports where
 * it matters most, while the same endpoint over HTTP ran it. One runner, one
 * chain, so a concern declared once holds wherever the endpoint is reachable.
 */

import type { Sources } from "../define/types";
import type { BaseOptions, Context } from "../http-client/types";
import { LIMITS } from "../limits";
import { composeMiddleware } from "../middleware";
import { sessionFor } from "../session/call-session";
import { sessionTargetOf } from "../session/session-target";
import { buildMiddlewareContext, carryForwardedFor } from "./execute-middleware-context";
import { resolveMiddlewareChain } from "./execute-options";
import { namedHeadersOf, resolveEndpoint } from "./execute-resolve";
import { applyCallSession } from "./execute-session";
import { forwardedFor } from "./forwarded-for";

export interface TransportMiddlewareInput {
  /** Which transport is asking, so the context reports it accurately. */
  transport: "sse" | "ws";
  sources: Sources;
  source: string;
  group: string | undefined;
  method: string;
  variables: unknown;
  /** The request that opened the stream, for middleware that reads it. */
  request: Request;
  requestId: string;
  /** Overrides the shared middleware deadline. */
  timeoutMs?: number;
}

/** What a stream or a channel is opened with, once its middleware ran. */
export interface TransportOpened {
  /** Headers the chain assembled, to hand to the endpoint */
  readonly headers: Headers;
  /**
   * The source's options, read once as the stream was opened: what a relay
   * opens the upstream at and with, as the session it carries was found for
   */
  readonly options: BaseOptions | undefined;
}

/**
 * Run the chain and return the headers it produced. The source's options
 * are read once, and what the stream takes of them is checked, on a
 * server, before the chain reads any of it.
 *
 * @param input - The call being opened, and the transport opening it
 * @returns The headers the chain assembled, and the options it read
 * @throws When a middleware rejects, or the chain outruns its deadline
 *
 * @example
 * ```ts
 * const { headers } = await runTransportMiddleware({
 *   transport: "sse", sources, source, group, method, variables, request, requestId,
 * });
 * ```
 */
export async function runTransportMiddleware(
  input: TransportMiddlewareInput,
): Promise<TransportOpened> {
  const { transport, sources, source, group, method, variables, request, requestId } = input;

  const dataSource = sources[source] as unknown as Record<string, unknown>;
  const options = dataSource.options as BaseOptions | undefined;
  const { options: endpointOptions, schema } = resolveEndpoint(dataSource, group, method);

  const context: Context = { req: request, mode: "proxy" };
  /* A stream reads: it carries the session and the forwarded headers as a
     read over HTTP does, for the upstream a relayed stream is opened on —
     asked for first, so a server checks them before anything reads them. */
  const target = sessionTargetOf({
    dataSource,
    options,
    endpointOptions,
    kind: "query",
    httpMethod: "GET",
    name: [source, group, method].filter(Boolean).join("."),
  });
  const pending = sessionFor(context, target);
  const middlewareCtx = buildMiddlewareContext({
    source,
    group,
    method,
    variables,
    context,
    sourceOptions: options,
    requestId,
    transport,
    namedHeaders: namedHeadersOf(options, endpointOptions),
    kind: schema?.type,
  });
  applyCallSession(await pending, middlewareCtx, {}, undefined);
  carryForwardedFor(middlewareCtx.headers, forwardedFor(request));

  const middlewares = resolveMiddlewareChain(dataSource, options?.middleware, endpointOptions);

  if (middlewares.length > 0) {
    const timeoutMs = input.timeoutMs ?? LIMITS.MIDDLEWARE_TIMEOUT_MS;
    await withDeadline(
      composeMiddleware(middlewares)(middlewareCtx, async () => ({
        status: 200,
        data: undefined,
        headers: new Headers(),
      })),
      timeoutMs,
      `${transport} middleware timeout (${timeoutMs}ms)`,
    );
  }

  return { headers: middlewareCtx.headers, options };
}

/** Reject when `promise` outruns `ms`, clearing the timer either way. */
function withDeadline<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}
