import { studioHooks } from "@noverax/nexus";
import type { EventBus } from "../../event-bus";
import type {
  AnyStudioEvent,
  ProxyClientTimingEvent,
  ValidationFailEvent,
  ValidationPassEvent,
  ValidationStartEvent,
} from "../../events";

/** Create an event with session envelope */
const createEvent = <TEvent extends AnyStudioEvent>(
  sessionId: string,
  partial: Omit<TEvent, "sessionId">,
): TEvent => ({ ...partial, sessionId }) as TEvent;

/** Wire validation and proxy client timing hooks to the bus */
export function wireValidationHooks(bus: EventBus, sessionId: string): void {
  studioHooks.onValidationStart = (e) => {
    bus.emit(
      createEvent<ValidationStartEvent>(sessionId, {
        id: e.requestId,
        type: "validation:start",
        timestamp: e.timestamp,
        requestId: e.requestId,
        target: e.target,
      }),
    );
  };

  studioHooks.onValidationPass = (e) => {
    bus.emit(
      createEvent<ValidationPassEvent>(sessionId, {
        id: e.requestId,
        type: "validation:pass",
        timestamp: e.timestamp,
        requestId: e.requestId,
        target: e.target,
        duration: e.duration,
      }),
    );
  };

  studioHooks.onValidationFail = (e) => {
    bus.emit(
      createEvent<ValidationFailEvent>(sessionId, {
        id: e.requestId,
        type: "validation:fail",
        timestamp: e.timestamp,
        requestId: e.requestId,
        target: e.target,
        issues: e.issues,
        duration: e.duration,
      }),
    );
  };

  studioHooks.onProxyClientTiming = (e) => {
    bus.emit(
      createEvent<ProxyClientTimingEvent>(sessionId, {
        id: e.requestId,
        type: "proxy:client-timing",
        timestamp: e.timestamp,
        requestId: e.requestId,
        networkLatency: e.networkLatency,
        download: e.download,
        totalRoundTrip: e.totalRoundTrip,
      }),
    );
  };
}
