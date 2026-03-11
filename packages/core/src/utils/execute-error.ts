import type { DevToolsHooks } from "../devtools";
import { HTTPError } from "../error";
import type { Context } from "../http-client/types";
import { ValidationError } from "../validation";
import { buildResponse } from "./execute-response";

export type ErrorHandlerCtx = {
  requestId: string;
  dt: Partial<DevToolsHooks>;
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
            ? "http"
            : error instanceof TypeError
              ? "network"
              : "unknown",
      status: error instanceof HTTPError ? error.status : undefined,
      message: error instanceof Error ? error.message : String(error),
    },
    timestamp: performance.now(),
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

  const responseResult =
    error instanceof HTTPError
      ? { status: error.status, headers: error.headers, data: error.data }
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
