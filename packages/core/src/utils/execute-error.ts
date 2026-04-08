import { HTTPError } from "../error";
import type { Context } from "../http-client/types";
import type { StudioHooks } from "../studio";
import { ValidationError } from "../validation";
import { buildResponse } from "./execute-response";

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
      ? { status: httpStatus, headers: error.headers, data: error.data }
      : {
          status: 500,
          headers: new Headers(),
          data:
            error instanceof Error
              ? { success: false, message: error.message }
              : { success: false, message: "[SERVER ERROR]" },
        };

  return buildResponse(ctx.context, {
    ...responseResult,
    throw: new HTTPError(responseResult),
    rawData: ctx.rawData,
  });
}
