import { HTTPError } from "../errors";
import type { Context } from "../http-client/types";
import { composeMiddleware } from "../middleware/index";
import type { Middleware, MiddlewareContext } from "../middleware/types";
import type { CallSession } from "../session/call-session";
import { relayCookies } from "../session/relay";
import type { SchemaMetadata } from "../validation";
import { applyCacheHeaders } from "./cache-headers";
import { handleExecuteError } from "./execute-error";
import { executeInner, type InnerExecuteDeps } from "./execute-inner";
import { buildResponse } from "./execute-response";
import {
  emitRequestEnd,
  injectTimingHeaders,
  type StudioContext,
  type TimingState,
} from "./execute-studio";
import { validateVariables } from "./execute-validation";

/** A call ready to run: its endpoint, its middleware and how to answer it. */
export interface PreparedCall {
  /** What the endpoint runs with, less what the middleware may still change. */
  inner: Omit<InnerExecuteDeps, "middlewareHeaders" | "variables">;
  middlewareCtx: MiddlewareContext;
  middlewares: Middleware[];
  schema: SchemaMetadata | undefined;
  studio: StudioContext;
  timing: TimingState;
  context: Context | undefined;
  /** What the user's session and `forward` gave the call, when they gave it anything */
  session?: CallSession | undefined;
  answer: { rawData: boolean; stream: boolean; namedHeaders: string[] | undefined };
}

/**
 * Run a call: validate its variables, pass it through its middleware to the
 * endpoint, and build its answer, or the answer its failure gets.
 *
 * Middleware runs around the endpoint, so the headers and variables it
 * leaves on the context are the ones the endpoint is called with.
 *
 * @param call - The call, prepared by `executeRequest`
 * @returns The answer: a `Response` for the proxy, the data or the whole
 *   response for a direct caller
 *
 * @example
 * ```ts
 * return runCall({ inner, middlewareCtx, middlewares, schema, studio, timing, context, answer });
 * ```
 */
export async function runCall(call: PreparedCall): Promise<unknown> {
  const { middlewareCtx: ctx, middlewares, schema, studio, timing, context } = call;
  try {
    if (schema?.variables) {
      const result = await validateVariables(schema.variables, ctx.variables, studio);
      ctx.variables = result.validated;
      timing.tVarValidation = result.duration;
    }

    const execute = async () => {
      const innerResult = await executeInner({
        ...call.inner,
        middlewareHeaders: ctx.headers,
        variables: ctx.variables,
      });
      timing.tRespValidation = innerResult.tRespValidation;
      return innerResult.response;
    };

    const mt0 = studio.hasStudio ? performance.now() : 0;
    const result = middlewares.length
      ? await composeMiddleware(middlewares)(ctx, execute)
      : await execute();
    const tMiddlewareTotal = studio.hasStudio && middlewares.length ? performance.now() - mt0 : 0;

    if (studio.hasStudio) {
      emitRequestEnd(studio, result, ctx.headers, timing, tMiddlewareTotal, context);
    }

    const relayed = relayOf(call, result.headers);
    const response = withCookies(
      buildResponse(context, {
        headers: result.headers,
        status: result.status,
        data: result.data,
        ...call.answer,
      }),
      relayed,
    );

    if (context?.proxyMethod && response instanceof Response && studio.hasStudio) {
      injectTimingHeaders(response, studio.requestId, timing.t0);
    }
    if (context?.proxyMethod === "GET" && schema?.cache && response instanceof Response) {
      applyCacheHeaders(response, schema, ctx.headers, ctx.request);
    }

    return response;
  } catch (error) {
    /* An error answer sets cookies as a success does: a sign-in refused
       clears the session it names, and a renewal can ride on a 401. */
    const relayed = relayOf(call, error instanceof HTTPError ? error.headers : undefined);
    return withCookies(
      handleExecuteError(error, {
        requestId: studio.requestId,
        dt: studio.dt,
        context,
        rawData: call.answer.rawData,
        namedHeaders: call.answer.namedHeaders,
        timing,
        middlewareCount: middlewares.length,
        signal: call.inner.baseOptions.signal ?? undefined,
      }),
      relayed,
    );
  }
}

/* The session cookies the API set, carried on; the ones a Response of the call's own has to carry. */
function relayOf(call: PreparedCall, upstream: Headers | undefined): string[] {
  if (call.session === undefined) return [];
  return relayCookies(upstream, call.session, call.context?.res instanceof Response);
}

function withCookies(answer: unknown, cookies: readonly string[]): unknown {
  if (answer instanceof Response)
    for (const cookie of cookies) answer.headers.append("set-cookie", cookie);
  return answer;
}
