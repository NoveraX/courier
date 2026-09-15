/**
 * Public surface for `@noverax/nexus-studio-core` (top-level entry).
 *
 * Owns:
 *  - `EventBus` — the in-process Studio telemetry bus
 *  - Studio event types (the discriminated union consumed by Studio UI
 *    + framework adapters that re-emit events)
 *  - `extractSourceMap` + `isSafeHttpOrigin` — pure utilities used by
 *    framework adapters and the Studio dev server
 *
 * Runtime-side functionality (`attachRuntime`, `loadNexusConfig`,
 * `announceHosting`, `setAppOrigin`, …) lives behind
 * `@noverax/nexus-studio-core/runtime` so the top-level entry stays
 * tree-shake-friendly for non-runtime consumers (Studio dev server
 * imports types from here, never from `/runtime`).
 *
 * Source registry (`getSources` / `registerSources` / `onSourcesChange` /
 * `getSourcesGeneration`) lives in `@noverax/nexus` core — framework
 * adapters import it directly from there without depending on
 * `@noverax/nexus-studio-core`.
 */

export { EventBus } from "./event-bus";
export type {
  AnyStudioEvent,
  CacheHitEvent,
  CacheInvalidateEvent,
  CacheMissEvent,
  CacheStoreEvent,
  DedupAbortEvent,
  DedupReuseEvent,
  EventType,
  HttpFetchEndEvent,
  HttpFetchErrorEvent,
  HttpFetchStartEvent,
  MiddlewareEnterEvent,
  MiddlewareErrorEvent,
  MiddlewareExitEvent,
  ProxyOriginRejectEvent,
  ProxyParseEvent,
  ProxyReceiveEvent,
  ProxyRespondEvent,
  RequestAbortEvent,
  RequestEndEvent,
  RequestErrorEvent,
  RequestStartEvent,
  RequestTiming,
  SourceMap,
  StudioEvent,
  UploadCompleteEvent,
  UploadProgressEvent,
  ValidationFailEvent,
  ValidationPassEvent,
  ValidationStartEvent,
} from "./events";
export { isSafeHttpOrigin } from "./lib/is-safe-http-origin";
export { extractSourceMap } from "./source-map";
