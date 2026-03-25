export type {
  CacheHitEvent,
  CacheInvalidateEvent,
  CacheMissEvent,
  CacheStoreEvent,
} from "./cache";
export type {
  ConnectionHeartbeatEvent,
  ConnectionInitEvent,
  ConnectionSourcesEvent,
} from "./connection";
export type { DedupAbortEvent, DedupReuseEvent } from "./dedup";
export type {
  HttpFetchEndEvent,
  HttpFetchErrorEvent,
  HttpFetchStartEvent,
} from "./http";
export type {
  MiddlewareEnterEvent,
  MiddlewareErrorEvent,
  MiddlewareExitEvent,
} from "./middleware";
export type {
  MockCollectionSnapshot,
  MockHotReloadEvent,
  MockNetworkConfigEvent,
  MockNetworkSnapshot,
  MockRequestEndEvent,
  MockRequestErrorEvent,
  MockRequestStartEvent,
  MockRouteInfo,
  MockRouteListEvent,
  MockScenarioActiveEvent,
  MockScenarioInfo,
  MockServerConnectEvent,
  MockServerDisconnectEvent,
  MockServerStatusEvent,
  MockStoreChangeEvent,
  MockStoreSnapshotEvent,
} from "./mock";
export type {
  ProxyOriginRejectEvent,
  ProxyParseEvent,
  ProxyReceiveEvent,
  ProxyRespondEvent,
} from "./proxy";
export type {
  ProxyClientTimingEvent,
  RequestAbortEvent,
  RequestEndEvent,
  RequestErrorEvent,
  RequestStartEvent,
  RequestTiming,
} from "./request";
export type { DevToolsEvent, EventType, SourceMap } from "./types";
export type { UploadCompleteEvent, UploadProgressEvent } from "./upload";
export type {
  ValidationFailEvent,
  ValidationPassEvent,
  ValidationStartEvent,
} from "./validation";
export type { WatcherChangeEvent, WatcherStatusEvent } from "./watcher";

// ── Union type ─────────────────────────────────────────────────────────────────

import type { CacheHitEvent, CacheInvalidateEvent, CacheMissEvent, CacheStoreEvent } from "./cache";
import type {
  ConnectionHeartbeatEvent,
  ConnectionInitEvent,
  ConnectionSourcesEvent,
} from "./connection";
import type { DedupAbortEvent, DedupReuseEvent } from "./dedup";
import type { HttpFetchEndEvent, HttpFetchErrorEvent, HttpFetchStartEvent } from "./http";
import type { MiddlewareEnterEvent, MiddlewareErrorEvent, MiddlewareExitEvent } from "./middleware";
import type {
  MockHotReloadEvent,
  MockNetworkConfigEvent,
  MockRequestEndEvent,
  MockRequestErrorEvent,
  MockRequestStartEvent,
  MockRouteListEvent,
  MockScenarioActiveEvent,
  MockServerConnectEvent,
  MockServerDisconnectEvent,
  MockServerStatusEvent,
  MockStoreChangeEvent,
  MockStoreSnapshotEvent,
} from "./mock";
import type {
  ProxyOriginRejectEvent,
  ProxyParseEvent,
  ProxyReceiveEvent,
  ProxyRespondEvent,
} from "./proxy";
import type {
  ProxyClientTimingEvent,
  RequestAbortEvent,
  RequestEndEvent,
  RequestErrorEvent,
  RequestStartEvent,
} from "./request";
import type { UploadCompleteEvent, UploadProgressEvent } from "./upload";
import type { ValidationFailEvent, ValidationPassEvent, ValidationStartEvent } from "./validation";

export type AnyDevToolsEvent =
  | ConnectionInitEvent
  | ConnectionHeartbeatEvent
  | ConnectionSourcesEvent
  | RequestStartEvent
  | RequestEndEvent
  | RequestErrorEvent
  | RequestAbortEvent
  | HttpFetchStartEvent
  | HttpFetchEndEvent
  | HttpFetchErrorEvent
  | MiddlewareEnterEvent
  | MiddlewareExitEvent
  | MiddlewareErrorEvent
  | ValidationStartEvent
  | ValidationPassEvent
  | ValidationFailEvent
  | ProxyReceiveEvent
  | ProxyParseEvent
  | ProxyOriginRejectEvent
  | ProxyRespondEvent
  | ProxyClientTimingEvent
  | CacheHitEvent
  | CacheMissEvent
  | CacheStoreEvent
  | CacheInvalidateEvent
  | DedupAbortEvent
  | DedupReuseEvent
  | UploadProgressEvent
  | UploadCompleteEvent
  | MockServerConnectEvent
  | MockServerDisconnectEvent
  | MockServerStatusEvent
  | MockRouteListEvent
  | MockStoreSnapshotEvent
  | MockStoreChangeEvent
  | MockScenarioActiveEvent
  | MockNetworkConfigEvent
  | MockRequestStartEvent
  | MockRequestEndEvent
  | MockRequestErrorEvent
  | MockHotReloadEvent;
