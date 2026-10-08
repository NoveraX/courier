/**
 * Public surface for `@noverax/courier-studio-core` (top-level entry).
 *
 * Owns:
 *  - `EventBus` — the in-process Studio telemetry bus
 *  - Studio event types (the discriminated union consumed by Studio UI
 *    + framework adapters that re-emit events)
 *  - `extractSourceMap` + `isSafeHttpOrigin` — pure utilities used by
 *    framework adapters and the Studio dev server
 *
 * Runtime-side functionality (`attachRuntime`, `loadCourierConfig`,
 * `announceHosting`, `setAppOrigin`, …) lives behind
 * `@noverax/courier-studio-core/runtime` so the top-level entry stays
 * tree-shake-friendly for non-runtime consumers (Studio dev server
 * imports types from here, never from `/runtime`).
 *
 * Source registry (`getSources` / `registerSources` / `onSourcesChange` /
 * `getSourcesGeneration`) lives in `@noverax/courier` core — framework
 * adapters import it directly from there without depending on
 * `@noverax/courier-studio-core`.
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
  HttpVersion,
  MiddlewareEnterEvent,
  MiddlewareErrorEvent,
  MiddlewareExitEvent,
  MockCollectionEdits,
  MockCollectionReport,
  MockCollectionSnapshot,
  MockStoreChangesEvent,
  MockStoreReport,
  ProxyOriginRejectEvent,
  ProxyParseEvent,
  ProxyReceiveEvent,
  ProxyRespondEvent,
  RequestAbortEvent,
  RequestAgent,
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
export { playgroundRequestId } from "./lib/playground-request-id";
export { applyStoreReport, readStoreReport } from "./mock-store";
export type { SchemaField } from "./schema-fields";
export { extractSourceMap } from "./source-map";
