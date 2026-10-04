import { HTTPError } from "../errors";
import { isTimeoutFailure } from "../http-client/transport-failure";
import type { Context } from "../http-client/types";
import { createLogger } from "../logger";
import { ValidationError } from "../validation";
import { isAbortError } from "./abort";
import { answerCallerLeft, callerLeft } from "./caller-left";
import { type FailureReport, reportRequestError } from "./execute-error-report";
import { buildResponse, type InternalResponse } from "./execute-response";
import { injectTimingHeaders } from "./execute-studio";
import { isRecord } from "./is-record";

const log = createLogger("Proxy");

/**
 * A transport-level failure carries the operating system's own words, and
 * those name the host the server was dialling — `getaddrinfo ENOTFOUND
 * internal-api.corp.example`. Answering a browser with them discloses the
 * upstream the proxy exists to keep behind it, so the caller is told that the
 * request failed and the reason stays in the server's log.
 *
 * A timeout is told apart: the upstream was reachable and slow, so the
 * answer is a 504 rather than the 502 of a host that could not be reached.
 *
 * An upstream that answered for itself is a different thing: its status and
 * body are its own message to the client, and the proxy forwards them.
 */
function withoutUpstreamDetail(
  result: { status: number; headers: Headers; data: unknown },
  error: HTTPError,
  context: Context | undefined,
): { status: number; headers: Headers; data: unknown } {
  const fromWire = context?.proxyMethod !== undefined;
  if (!fromWire || error.status !== 0) return result;

  /* The log may name the upstream: it is the server's own record. */
  const { data } = error;
  const message = isRecord(data) && typeof data.message === "string" ? data.message : undefined;
  log.warn(`Upstream request failed${message ? `: ${message}` : ""}`, error.cause ?? error);

  if (isTimeoutFailure(error)) {
    return {
      ...result,
      status: 504,
      data: { success: false, message: "Upstream request timed out", code: "UPSTREAM_TIMEOUT" },
    };
  }
  return {
    ...result,
    data: { success: false, message: "Upstream request failed", code: "UPSTREAM_UNREACHABLE" },
  };
}

/**
 * Anything that reached here without being an `HTTPError` is the server's own
 * failure — a middleware that threw, a bug in the executor. Its text was
 * written for whoever runs the server, so a browser is told only that the
 * request failed while the message goes to the log.
 */
function serverFailure(
  error: unknown,
  context: Context | undefined,
): { status: number; headers: Headers; data: unknown } {
  const message = error instanceof Error ? error.message : "[SERVER ERROR]";
  const result = { status: 500, headers: new Headers() };

  if (context?.proxyMethod === undefined) {
    return { ...result, data: { success: false, message } };
  }

  log.error(`Request failed: ${message}`, error);
  return { ...result, data: { success: false, message: "Request failed" } };
}

export type ErrorHandlerCtx = FailureReport & {
  rawData: boolean;
  /** Header names the endpoint and its source carry across the proxy. */
  namedHeaders?: readonly string[] | undefined;
};

export function handleExecuteError(error: unknown, ctx: ErrorHandlerCtx): unknown {
  const answersWithResponse = ctx.context?.res instanceof Response;
  if (error instanceof ValidationError) {
    reportRequestError(error, ctx, answersWithResponse ? 422 : undefined);
    return timed(ctx, {
      status: 422,
      headers: new Headers(),
      data: {
        success: false,
        message: error.message,
        target: error.target,
        issues: error.issues,
      },
      throw: error,
      rawData: ctx.rawData,
    });
  }

  const fromWire = ctx.context?.proxyMethod !== undefined;
  /* A direct caller gets its failure as it happened: a cancellation with the
     reason it gave, a network failure with status 0 and its cause, the
     upstream's own answer — a 2xx whose body would not parse keeps its 200 —
     or what its own middleware threw — not a 502 from a gateway that is not
     there, nor an HTTP 500 with no cause. A caller that asked for a Response
     is answered with one, unless it cancelled. */
  if (!fromWire && (!answersWithResponse || isAbortError(error) || error instanceof HTTPError)) {
    reportRequestError(
      error,
      ctx,
      error instanceof HTTPError ? error.status || undefined : undefined,
    );
    throw error;
  }
  if (callerLeft(ctx.context)) {
    reportRequestError(error, ctx, undefined);
    return answerCallerLeft(error, ctx.context, ctx.rawData);
  }

  /* A 2xx error is an upstream answer the proxy could not use — a body that
     would not parse. Passed on as it was, a failure reached the browser as a
     success carrying `{ success: false }` where the endpoint's data should be. */
  const httpStatus =
    error instanceof HTTPError && error.status >= 300 && error.status <= 599 ? error.status : 502;

  const responseResult =
    error instanceof HTTPError
      ? withoutUpstreamDetail(
          { status: httpStatus, headers: error.headers, data: error.data },
          error,
          ctx.context,
        )
      : serverFailure(error, ctx.context);

  reportRequestError(error, ctx, responseResult.status);
  return timed(ctx, {
    ...responseResult,
    throw: new HTTPError(responseResult),
    rawData: ctx.rawData,
    /* An upstream's error answer is its own, and a sign-out that fails still
       clears the session it names. */
    namedHeaders: ctx.namedHeaders,
  });
}

/**
 * Build the answer, and when it goes to a browser through the proxy, stamp
 * it as a success is stamped, so the browser measures its side of the call.
 */
function timed(ctx: ErrorHandlerCtx, response: InternalResponse): unknown {
  const answer = buildResponse(ctx.context, response);
  const t0 = ctx.timing?.t0 ?? 0;
  if (ctx.context?.proxyMethod && answer instanceof Response && t0 > 0) {
    injectTimingHeaders(answer, ctx.requestId, t0);
  }
  return answer;
}
