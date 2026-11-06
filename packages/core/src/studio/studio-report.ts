import type { StudioCapability } from "../capabilities/studio";
import {
  attachFetchHook,
  emitRequestEnd,
  emitRequestStart,
  injectTimingHeaders,
} from "./call-report";
import { withStudioUploads } from "./call-uploads";
import type { StudioHooks } from "./hooks";
import { proxyClientTiming, proxyUploads } from "./proxy-client-report";
import { reportRequestError } from "./request-error-report";

/**
 * Studio's view of the calls of this process, told through `hooks`: what
 * the calls' code hands over is built into the events Studio's runtime
 * listens for here.
 *
 * @param hooks - The hooks Studio's runtime sets
 * @param requestId - Makes a new id for a call Studio is told of
 * @returns The capability the server lends its calls
 * @example
 * ```ts
 * provideServerCapability("studio", createStudioReport(studioHooks, generateRequestId));
 * ```
 */
export function createStudioReport(hooks: StudioHooks, requestId: () => string): StudioCapability {
  return {
    hooks,
    requestId,
    requestStart: emitRequestStart,
    requestEnd: emitRequestEnd,
    requestError: reportRequestError,
    watchFetch: attachFetchHook,
    timingHeaders: injectTimingHeaders,
    callUploads: withStudioUploads,
    proxyUploads: (options) => proxyUploads(hooks, options),
    proxyClientTiming: (response, t0, tHeaders) => proxyClientTiming(hooks, response, t0, tHeaders),
  };
}
