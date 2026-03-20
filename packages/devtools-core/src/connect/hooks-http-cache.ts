import { devtoolsHooks } from "@noverax/nexus";
import type { EventBus } from "../event-bus";
import type {
  AnyDevToolsEvent,
  CacheHitEvent,
  CacheInvalidateEvent,
  CacheMissEvent,
  CacheStoreEvent,
} from "../events";

/** Create an event with session envelope */
const createEvent = <TEvent extends AnyDevToolsEvent>(
  sessionId: string,
  partial: Omit<TEvent, "sessionId">,
): TEvent => ({ ...partial, sessionId }) as TEvent;

/** Wire cache hooks to the bus */
export function wireCacheHooks(bus: EventBus, sessionId: string): void {
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
}
