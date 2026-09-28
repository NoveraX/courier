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

import { LIMITS } from "../adapter/limits";
import type { Sources } from "../define/types";
import type { Context } from "../http-client/types";
import { composeMiddleware } from "../middleware";
import { buildMiddlewareContext } from "./execute-middleware-context";
import { resolveMiddlewareChain } from "./execute-options";
import { resolveEndpoint } from "./execute-resolve";

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

/**
 * Run the chain and return the headers it produced.
 *
 * @param input - The call being opened, and the transport opening it
 * @returns Headers the chain assembled, to hand to the endpoint
 * @throws When a middleware rejects, or the chain outruns its deadline
 *
 * @example
 * ```ts
 * const headers = await runTransportMiddleware({
 *   transport: "sse", sources, source, group, method, variables, request, requestId,
 * });
 * ```
 */
export async function runTransportMiddleware(input: TransportMiddlewareInput): Promise<Headers> {
  const { transport, sources, source, group, method, variables, request, requestId } = input;

  const dataSource = sources[source] as unknown as Record<string, unknown>;
  const { options: endpointOptions, schema } = resolveEndpoint(dataSource, group, method);

  const middlewareCtx = buildMiddlewareContext({
    source,
    group,
    method,
    variables,
    context: { req: request, mode: "proxy" } as Context,
    dataSource,
    requestId,
    transport,
    endpointAllowedHeaders: endpointOptions?.allowedHeaders,
    kind: schema?.type,
  });

  const sourceMiddleware = (dataSource.options as { middleware?: unknown } | undefined)
    ?.middleware as Parameters<typeof composeMiddleware>[0] | undefined;
  const middlewares = resolveMiddlewareChain(sourceMiddleware, endpointOptions);

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

  return middlewareCtx.headers;
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
