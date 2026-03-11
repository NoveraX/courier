import { devtoolsHooks } from "@noverax/nexus";
import type { EventBus } from "../event-bus";
import type {
  AnyDevToolsEvent,
  CacheHitEvent,
  CacheInvalidateEvent,
  CacheMissEvent,
  CacheStoreEvent,
  DedupAbortEvent,
  DedupReuseEvent,
  HttpFetchEndEvent,
  HttpFetchStartEvent,
  ProxyReceiveEvent,
  ProxyRespondEvent,
  UploadCompleteEvent,
  UploadProgressEvent,
} from "../events";

/** Create an event with session envelope */
const createEvent = <T extends AnyDevToolsEvent>(
  sessionId: string,
  partial: Omit<T, "sessionId">,
): T => ({ ...partial, sessionId }) as T;

/** Wire HTTP, proxy, cache, dedup, and upload hooks to the bus */
export function wireHttpHooks(
  bus: EventBus,
  sessionId: string,
  resolveSourceName: (name: string) => string,
  shouldFilter: (source: string) => boolean,
): void {
  devtoolsHooks.onHttpFetchStart = (e) => {
    bus.emit(
      createEvent<HttpFetchStartEvent>(sessionId, {
        id: e.requestId,
        type: "http:fetch:start",
        timestamp: e.timestamp,
        requestId: e.requestId,
        url: e.url,
        method: e.method,
      }),
    );
  };

  devtoolsHooks.onHttpFetchEnd = (e) => {
    bus.emit(
      createEvent<HttpFetchEndEvent>(sessionId, {
        id: e.requestId,
        type: "http:fetch:end",
        timestamp: e.timestamp,
        requestId: e.requestId,
        status: e.status,
        duration: e.duration,
      }),
    );
  };

  devtoolsHooks.onProxyReceive = (e) => {
    if (shouldFilter(e.source)) return;
    bus.emit(
      createEvent<ProxyReceiveEvent>(sessionId, {
        id: `proxy_${Date.now().toString(36)}`,
        type: "proxy:receive",
        timestamp: e.timestamp,
        proxyMethod: e.proxyMethod,
        source: resolveSourceName(e.source),
        group: e.group,
        method: e.method,
      }),
    );
  };

  devtoolsHooks.onProxyRespond = (e) => {
    if (shouldFilter(e.source)) return;
    bus.emit(
      createEvent<ProxyRespondEvent>(sessionId, {
        id: `proxy_${Date.now().toString(36)}`,
        type: "proxy:respond",
        timestamp: e.timestamp,
        proxyMethod: e.proxyMethod,
        source: resolveSourceName(e.source),
        group: e.group,
        method: e.method,
        status: e.status,
      }),
    );
  };

  devtoolsHooks.onCacheHit = (e) => {
    bus.emit(
      createEvent<CacheHitEvent>(sessionId, {
        id: e.requestId,
        type: "cache:hit",
        timestamp: e.timestamp,
        requestId: e.requestId,
        key: e.key,
        age: e.age,
      }),
    );
  };

  devtoolsHooks.onCacheMiss = (e) => {
    bus.emit(
      createEvent<CacheMissEvent>(sessionId, {
        id: e.requestId,
        type: "cache:miss",
        timestamp: e.timestamp,
        requestId: e.requestId,
        key: e.key,
      }),
    );
  };

  devtoolsHooks.onCacheStore = (e) => {
    bus.emit(
      createEvent<CacheStoreEvent>(sessionId, {
        id: e.requestId,
        type: "cache:store",
        timestamp: e.timestamp,
        requestId: e.requestId,
        key: e.key,
        ttl: e.ttl,
      }),
    );
  };

  devtoolsHooks.onCacheInvalidate = (e) => {
    bus.emit(
      createEvent<CacheInvalidateEvent>(sessionId, {
        id: `cache_${Date.now().toString(36)}`,
        type: "cache:invalidate",
        timestamp: e.timestamp,
        key: e.key,
        reason: e.reason,
      }),
    );
  };

  devtoolsHooks.onDedupAbort = (e) => {
    bus.emit(
      createEvent<DedupAbortEvent>(sessionId, {
        id: e.requestId,
        type: "dedup:abort",
        timestamp: e.timestamp,
        requestId: e.requestId,
        key: e.key,
      }),
    );
  };

  devtoolsHooks.onDedupReuse = (e) => {
    bus.emit(
      createEvent<DedupReuseEvent>(sessionId, {
        id: e.requestId,
        type: "dedup:reuse",
        timestamp: e.timestamp,
        requestId: e.requestId,
        key: e.key,
      }),
    );
  };

  devtoolsHooks.onUploadProgress = (e) => {
    bus.emit(
      createEvent<UploadProgressEvent>(sessionId, {
        id: e.requestId,
        type: "upload:progress",
        timestamp: e.timestamp,
        requestId: e.requestId,
        loaded: e.loaded,
        total: e.total,
        percentage: e.percentage,
      }),
    );
  };

  devtoolsHooks.onUploadComplete = (e) => {
    bus.emit(
      createEvent<UploadCompleteEvent>(sessionId, {
        id: e.requestId,
        type: "upload:complete",
        timestamp: e.timestamp,
        requestId: e.requestId,
      }),
    );
  };
}
