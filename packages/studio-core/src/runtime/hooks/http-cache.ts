import { studioHooks } from "@noverax/nexus";
import type { EventBus } from "../../event-bus";
import type {
  AnyStudioEvent,
  CacheHitEvent,
  CacheInvalidateEvent,
  CacheMissEvent,
  CacheStoreEvent,
} from "../../events";

/** Create an event with session envelope */
const createEvent = <TEvent extends AnyStudioEvent>(
  sessionId: string,
  partial: Omit<TEvent, "sessionId">,
): TEvent => ({ ...partial, sessionId }) as TEvent;

/** Wire cache hooks to the bus */
export function wireCacheHooks(bus: EventBus, sessionId: string): void {
  studioHooks.onCacheHit = (e) => {
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

  studioHooks.onCacheMiss = (e) => {
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

  studioHooks.onCacheStore = (e) => {
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

  studioHooks.onCacheInvalidate = (e) => {
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
