/**
 * Discriminated union of every event the studio bus can emit.
 */

import type { CacheHitEvent, CacheInvalidateEvent, CacheMissEvent, CacheStoreEvent } from "./cache";
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
import type {
  StreamCloseEvent,
  StreamErrorEvent,
  StreamMessageEvent,
  StreamOpenEvent,
} from "./stream";
import type { UploadCompleteEvent, UploadProgressEvent } from "./upload";
import type { ValidationFailEvent, ValidationPassEvent, ValidationStartEvent } from "./validation";

export type AnyStudioEvent =
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
  | StreamOpenEvent
  | StreamMessageEvent
  | StreamCloseEvent
  | StreamErrorEvent
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
