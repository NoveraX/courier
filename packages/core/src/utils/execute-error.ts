import { HTTPError, isCourierError, isRequestFailure, NetworkError, TimeoutError } from "../errors";
import { platformCause } from "../http-client/transport-failure";
import type { Context } from "../http-client/types";
import { createLogger } from "../logger";
import { ValidationError } from "../validation";
import { isCancellation } from "./abort";
import { answeredMessage } from "./answered-message";
import { answerCallerLeft, callerLeft } from "./caller-left";
import { cancellation } from "./cancellation";
import { buildResponse, type InternalResponse } from "./execute-response";
import type { FailureReport } from "./execute-studio";
import { isError } from "./is-error";

const log = createLogger("Proxy");

/**
 * A request that got no answer carries the operating system's own words,
 * and those name the host the server was dialling — `getaddrinfo ENOTFOUND
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
function unansweredUpstream(error: NetworkError | TimeoutError): {
  status: number;
  headers: Headers;
  data: unknown;
} {
  /* The log may name the upstream: it is the server's own record. */
  const reason = error instanceof NetworkError ? noAnswerReason(error) : error.message;
  log.warn(`Upstream request failed: ${reason}`, error.cause ?? error);
  const headers = new Headers();
  if (error instanceof TimeoutError) {
    return {
      status: 504,
      headers,
      data: { success: false, message: "Upstream request timed out", code: "UPSTREAM_TIMEOUT" },
    };
  }
  return {
    status: 502,
    headers,
    data: { success: false, message: "Upstream request failed", code: "UPSTREAM_UNREACHABLE" },
  };
}

/* What the platform said of the connection, or the error's own words where it said nothing. */
function noAnswerReason(error: NetworkError): string {
  return isError(error.cause) ? platformCause(error.cause).message : error.message;
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
  const message = isError(error) ? error.message : "[SERVER ERROR]";
  const result = { status: 500, headers: new Headers() };

  /* A server that asked for a Response may hand it to a browser: the words stay, credentials go. */
  if (context?.proxyMethod === undefined) {
    return { ...result, data: { success: false, message: answeredMessage(message) } };
  }

  log.error(`Request failed: ${message}`, error);
  return { ...result, data: { success: false, message: "Request failed" } };
}

/* What the caller is to mend, not the server's failure, answered so with nothing in the log: no
   token where the call requires one, which the user mends by signing in, answered 401 as the
   upstream would have; and variables no request to the upstream can carry — a file in those of
   an endpoint whose verb sends them in the address, which a page cannot tell — answered 400, the
   message naming where the value sits, not what it holds. Read by their codes rather than their
   classes, so a page that sends no token carries none of authMiddleware's code. */
const MENDED_BY_CALLER = new Map([
  ["TOKEN_MISSING", 401],
  ["VARIABLE_NOT_ENCODABLE", 400],
]);

function callersToMend(
  error: unknown,
): { status: number; headers: Headers; data: unknown } | undefined {
  if (!isCourierError(error)) return undefined;
  const status = MENDED_BY_CALLER.get(error.code);
  if (status === undefined) return undefined;
  return {
    status,
    headers: new Headers(),
    data: { success: false, message: error.message, code: error.code },
  };
}

/* A 2xx error is an upstream answer the proxy could not use — a body that
   would not parse. Passed on as it was, a failure reached the browser as a
   success carrying `{ success: false }` where the endpoint's data should be. */
function upstreamAnswer(error: HTTPError): { status: number; headers: Headers; data: unknown } {
  return {
    status: error.status >= 300 ? error.status : 502,
    headers: error.headers,
    data: error.data,
  };
}

export type ErrorHandlerCtx = FailureReport & {
  rawData: boolean;
  /** Header names the endpoint and its source carry across the proxy. */
  namedHeaders?: readonly string[] | undefined;
  /** The call's variables: an upload being sent on as it arrives tells a slow client from a slow upstream. */
  variables?: unknown;
};

export function handleExecuteError(error: unknown, ctx: ErrorHandlerCtx): unknown {
  const answersWithResponse = ctx.context?.res instanceof Response;
  if (error instanceof ValidationError) {
    ctx.report?.requestError(error, ctx, answersWithResponse ? 422 : undefined);
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
  /* A direct caller gets its failure as it happened: a cancellation as an
     AbortError, the reason it gave its cause, a request that got no answer or ran out of time as such,
     with its cause, the upstream's own answer — a 2xx whose body would not
     parse keeps its 200 — or what its own middleware threw — not a 502 from
     a gateway that is not there, nor an HTTP 500 with no cause. A caller
     that asked for a Response is answered with one, unless it cancelled. */
  const cancelled = isCancellation(error) || ctx.signal?.aborted === true;
  if (!fromWire && (!answersWithResponse || cancelled || isRequestFailure(error))) {
    ctx.report?.requestError(error, ctx, error instanceof HTTPError ? error.status : undefined);
    throw cancelled ? cancellation(ctx.signal, error) : error;
  }
  if (callerLeft(ctx.context)) {
    ctx.report?.requestError(error, ctx, undefined);
    return answerCallerLeft(error, ctx.context, ctx.rawData);
  }
  /* An upload the proxy sent on as it arrived that failed on the client's
     side is answered as it would have been refused before the call ran,
     and the log says nothing of an upstream that failed nothing. */
  const failure = ctx.context?.unsentUpload?.(error, ctx.variables) ?? error;

  const responseResult =
    failure instanceof HTTPError
      ? upstreamAnswer(failure)
      : failure instanceof NetworkError || failure instanceof TimeoutError
        ? unansweredUpstream(failure)
        : (callersToMend(failure) ?? serverFailure(failure, ctx.context));

  ctx.report?.requestError(failure, ctx, responseResult.status);
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
    ctx.report?.timingHeaders(answer, ctx.requestId, t0);
  }
  return answer;
}
