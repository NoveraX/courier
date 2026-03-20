import { devtoolsHooks } from "@noverax/nexus";
import type { EventBus } from "../event-bus";
import type {
  AnyDevToolsEvent,
  MiddlewareEnterEvent,
  MiddlewareErrorEvent,
  MiddlewareExitEvent,
} from "../events";

/** Create an event with session envelope */
const createEvent = <TEvent extends AnyDevToolsEvent>(
  sessionId: string,
  partial: Omit<TEvent, "sessionId">,
): TEvent => ({ ...partial, sessionId }) as TEvent;

/** Wire middleware hooks to the bus */
export function wireMiddlewareHooks(bus: EventBus, sessionId: string): void {
  devtoolsHooks.onMiddlewareEnter = (e) => {
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

  devtoolsHooks.onMiddlewareExit = (e) => {
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

  devtoolsHooks.onMiddlewareError = (e) => {
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
