import { studioHooks } from "@noverax/courier/internal";
import type { EventBus } from "../../event-bus";
import type {
  AnyStudioEvent,
  HttpFetchEndEvent,
  HttpFetchErrorEvent,
  HttpFetchStartEvent,
} from "../../events";

/** Create an event with session envelope */
const createEvent = <TEvent extends AnyStudioEvent>(
  sessionId: string,
  partial: Omit<TEvent, "sessionId">,
): TEvent => ({ ...partial, sessionId }) as TEvent;

/** Wire fetch lifecycle hooks to the bus */
export function wireFetchHooks(bus: EventBus, sessionId: string): void {
  studioHooks.onHttpFetchStart = (e) => {
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

  studioHooks.onHttpFetchEnd = (e) => {
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

  studioHooks.onHttpFetchError = (e) => {
    bus.emit(
      createEvent<HttpFetchErrorEvent>(sessionId, {
        id: e.requestId,
        type: "http:fetch:error",
        timestamp: e.timestamp,
        requestId: e.requestId,
        message: e.message,
      }),
    );
  };
}
