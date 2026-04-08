import { studioHooks } from "@noverax/nexus";
import type { EventBus } from "../event-bus";

/** All hook names that connectStudio wires — cleared on disconnect */
const ALL_HOOK_NAMES = [
  "onRequestStart",
  "onRequestEnd",
  "onRequestError",
  "onRequestAbort",
  "onMiddlewareEnter",
  "onMiddlewareExit",
  "onMiddlewareError",
  "onValidationStart",
  "onValidationPass",
  "onValidationFail",
  "onHttpFetchStart",
  "onHttpFetchEnd",
  "onHttpFetchError",
  "onProxyReceive",
  "onProxyRespond",
  "onProxyParse",
  "onProxyOriginReject",
  "onCacheHit",
  "onCacheMiss",
  "onCacheStore",
  "onCacheInvalidate",
  "onDedupAbort",
  "onDedupReuse",
  "onUploadProgress",
  "onUploadComplete",
  "onProxyClientTiming",
  "onSourceDefined",
] as const;

/** Restore all hooks to no-ops and tear down connection */
export function disconnectAll(
  socketCleanup: (() => void) | undefined,
  bus: EventBus,
  clearConnection: () => void,
): void {
  for (const name of ALL_HOOK_NAMES) {
    (studioHooks as Record<string, unknown>)[name] = undefined;
  }
  socketCleanup?.();
  bus.clear();
  clearConnection();
}
