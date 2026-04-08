/**
 * Per-request lifecycle emitters: start / end / error.
 *
 * Groups request-related counters and payload shapes together so they
 * live next to each other.
 */

import type { BridgeContext } from "../types";
import type { EmitFn } from "./types";

export function createRequestEmitters(emit: EmitFn, ctx: BridgeContext) {
  return {
    /** Pushed after each request completes — keeps counters in sync */
    emitRequestStart(
      requestId: string,
      httpMethod: string,
      path: string,
      group: string,
      endpoint: string,
      variables?: unknown,
      requestHeaders?: Record<string, string>,
    ) {
      ctx.requestCounter++;
      ctx.scenarioRequestCount++;
      emit("mock:request:start", {
        requestId,
        httpMethod,
        path,
        group,
        endpoint,
        variables,
        requestHeaders,
      });
    },

    emitRequestEnd(
      requestId: string,
      status: number,
      data: unknown,
      duration: number,
      latencyInjected: number,
      scenarioState: string,
      responseHeaders?: Record<string, string>,
    ) {
      emit("mock:request:end", {
        requestId,
        status,
        data,
        duration,
        latencyInjected,
        scenarioState,
        responseHeaders,
        scenarioRequestCount: ctx.scenarioRequestCount,
      });
    },

    emitRequestError(requestId: string, status: number, message: string, duration: number) {
      ctx.scenarioRequestCount++;
      emit("mock:request:error", {
        requestId,
        status,
        message,
        duration,
        scenarioRequestCount: ctx.scenarioRequestCount,
      });
    },
  };
}
