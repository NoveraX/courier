import { HTTPError } from "../errors";
import { isTimeoutFailure } from "../http-client/transport-failure";
import type { Context } from "../http-client/types";
import type { RequestFailureKind, StudioHooks } from "../studio";
import { ValidationError } from "../validation";
import { isAbortError } from "./abort";
import { callerLeft } from "./caller-left";
import type { TimingState } from "./execute-studio";
import { headersToObject } from "./helpers";

/** What Studio needs to describe a request that failed. */
export interface FailureReport {
  requestId: string;
  dt: Partial<StudioHooks>;
  /** The request's timings so far; absent when Studio is not attached. */
  timing?: TimingState;
  /** How many middleware wrapped the call. */
  middlewareCount?: number;
  /** The call's signal, so a cancellation with a reason of its own is told apart. */
  signal?: AbortSignal;
  /** The call's context, carrying a proxied call's incoming request. */
  context?: Context;
}

/**
 * Say which way a request failed.
 *
 * A cancellation is told apart from a failure: the caller aborting its call,
 * with the platform's abort error or with a reason of its own, and a
 * proxied call whose browser left. A timeout is a kind of its own: the
 * request was given up on, not called off.
 *
 * @param error - What the request threw
 * @param signal - The call's signal, whose reason a cancellation rejects with
 * @param context - The call's context, carrying a proxied call's incoming request
 * @returns The kind of failure Studio shows
 * @example
 * ```ts
 * failureKind(new ValidationError("variables", [])); // → "validation"
 * ```
 */
export function failureKind(
  error: unknown,
  signal?: AbortSignal,
  context?: Context,
): RequestFailureKind {
  if (error instanceof ValidationError) return "validation";
  if (isAbortError(error) || callerLeft(context)) return "aborted";
  if (signal?.aborted === true && error === signal.reason) return "aborted";
  if (!(error instanceof HTTPError)) return "unknown";
  if (error.status > 0) return "http";
  return isTimeoutFailure(error) ? "timeout" : "network";
}

/**
 * Tell Studio a request failed, with what its caller received.
 *
 * A failure used to carry its kind and message alone, so its row had no
 * duration, no status and nothing to show for the answer: the upstream's
 * headers and error body went unseen, and every average counted it as 0µs.
 *
 * @param error - What the request threw
 * @param report - The request, and the hooks and timings Studio reads
 * @param status - The status the caller received, when it received one
 * @example
 * ```ts
 * reportRequestError(error, { requestId, dt, timing, middlewareCount: 1 }, 502);
 * ```
 */
export function reportRequestError(
  error: unknown,
  report: FailureReport,
  status: number | undefined,
): void {
  const { dt, timing } = report;
  if (!dt.onRequestError) return;
  const answered = error instanceof HTTPError && error.status > 0 ? error : undefined;
  dt.onRequestError({
    id: report.requestId,
    error: {
      type: failureKind(error, report.signal, report.context),
      status: answered?.status,
      message: error instanceof Error ? error.message : String(error),
    },
    ...(status !== undefined && { status }),
    ...(answered && { headers: headersToObject(answered.headers) ?? {}, data: answered.data }),
    ...(timing && timing.t0 > 0 && { timing: timingOf(timing, report.middlewareCount ?? 0) }),
    timestamp: Date.now(),
  });
}

function timingOf(timing: TimingState, middlewareCount: number) {
  const total = performance.now() - timing.t0;
  const validation = timing.tVarValidation + timing.tRespValidation;
  /* As for a success: middleware's own time, what the fetch and validation left. */
  const middleware = middlewareCount > 0 ? Math.max(0, total - timing.tFetch - validation) : 0;
  return { total, middleware, fetch: timing.tFetch, validation };
}
