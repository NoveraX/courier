import { HTTPError } from "../errors";
import type { Context } from "../http-client/types";
import { createLogger } from "../logger";
import type { StudioHooks } from "../studio";
import { ValidationError } from "../validation";
import { buildResponse } from "./execute-response";

const log = createLogger("Proxy");

/**
 * A transport-level failure carries the operating system's own words, and
 * those name the host the server was dialling — `getaddrinfo ENOTFOUND
 * internal-api.corp.example`. Answering a browser with them discloses the
 * upstream the proxy exists to keep behind it, so the caller is told that the
 * request failed and the reason stays in the server's log.
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

  const detail = error.data as { message?: string; code?: string } | undefined;
  log.warn(`Upstream request failed: ${detail?.message ?? "unknown"}`);

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

export type ErrorHandlerCtx = {
  requestId: string;
  dt: Partial<StudioHooks>;
  context?: Context;
  rawData: boolean;
};

export function handleExecuteError(error: unknown, ctx: ErrorHandlerCtx): unknown {
  ctx.dt.onRequestError?.({
    id: ctx.requestId,
    error: {
      type:
        error instanceof ValidationError
          ? "validation"
          : error instanceof HTTPError
            ? error.status > 0
              ? "http"
              : "network"
            : error instanceof TypeError
              ? "network"
              : "unknown",
      status: error instanceof HTTPError && error.status > 0 ? error.status : undefined,
      message: error instanceof Error ? error.message : String(error),
    },
    timestamp: Date.now(),
  });

  if (error instanceof ValidationError) {
    return buildResponse(ctx.context, {
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

  const httpStatus =
    error instanceof HTTPError && error.status >= 200 && error.status <= 599 ? error.status : 502;

  const responseResult =
    error instanceof HTTPError
      ? withoutUpstreamDetail(
          { status: httpStatus, headers: error.headers, data: error.data },
          error,
          ctx.context,
        )
      : serverFailure(error, ctx.context);

  return buildResponse(ctx.context, {
    ...responseResult,
    throw: new HTTPError(responseResult),
    rawData: ctx.rawData,
  });
}
