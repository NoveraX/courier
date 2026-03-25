import { studioHooks } from "@noverax/nexus";
import type { EventBus } from "../event-bus";
import type {
  AnyStudioEvent,
  MiddlewareEnterEvent,
  MiddlewareErrorEvent,
  MiddlewareExitEvent,
} from "../events";

/** Create an event with session envelope */
const createEvent = <TEvent extends AnyStudioEvent>(
  sessionId: string,
  partial: Omit<TEvent, "sessionId">,
): TEvent => ({ ...partial, sessionId }) as TEvent;

/** Wire middleware hooks to the bus */
export function wireMiddlewareHooks(bus: EventBus, sessionId: string): void {
  studioHooks.onMiddlewareEnter = (e) => {
    bus.emit(
      createEvent<MiddlewareEnterEvent>(sessionId, {
        id: e.requestId,
        type: "middleware:enter",
        timestamp: e.timestamp,
        requestId: e.requestId,
        name: e.name,
        index: e.index,
        totalCount: e.totalCount,
        phase: e.phase,
      }),
    );
  };

  studioHooks.onMiddlewareExit = (e) => {
    bus.emit(
      createEvent<MiddlewareExitEvent>(sessionId, {
        id: e.requestId,
        type: "middleware:exit",
        timestamp: e.timestamp,
        requestId: e.requestId,
        name: e.name,
        index: e.index,
        duration: e.duration,
        phase: e.phase,
        beforeDuration: e.beforeDuration,
        afterDuration: e.afterDuration,
        headersAdded: e.headersAdded,
      }),
    );
  };

  studioHooks.onMiddlewareError = (e) => {
    bus.emit(
      createEvent<MiddlewareErrorEvent>(sessionId, {
        id: e.requestId,
        type: "middleware:error",
        timestamp: e.timestamp,
        requestId: e.requestId,
        name: e.name,
        index: e.index,
        phase: e.phase,
        error: e.error,
      }),
    );
  };
}
