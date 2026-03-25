import { studioHooks } from "@noverax/nexus";
import type { EventBus } from "../event-bus";
import type {
  AnyStudioEvent,
  RequestAbortEvent,
  RequestEndEvent,
  RequestErrorEvent,
  RequestStartEvent,
} from "../events";

/** Create an event with session envelope */
const createEvent = <TEvent extends AnyStudioEvent>(
  sessionId: string,
  partial: Omit<TEvent, "sessionId">,
): TEvent => ({ ...partial, sessionId }) as TEvent;

/** Wire request lifecycle hooks to the bus */
export function wireRequestHooks(
  bus: EventBus,
  sessionId: string,
  resolveSourceName: (name: string) => string,
  shouldFilter: (source: string) => boolean,
): void {
  studioHooks.onRequestStart = (e) => {
    if (shouldFilter(e.source)) return;
    bus.emit(
      createEvent<RequestStartEvent>(sessionId, {
        id: e.id,
        type: "request:start",
        timestamp: e.timestamp,
        source: resolveSourceName(e.source),
        group: e.group,
        method: e.method,
        variables: e.variables,
        mode: e.mode,
        middlewareCount: e.middlewareCount,
        hasValidation: e.hasValidation,
      }),
    );
  };

  studioHooks.onRequestEnd = (e) => {
    bus.emit(
      createEvent<RequestEndEvent>(sessionId, {
        id: e.id,
        type: "request:end",
        timestamp: e.timestamp,
        requestId: e.id,
        status: e.status,
        data: e.data,
        size: e.size,
        headers: e.headers,
        requestHeaders: e.requestHeaders,
        timing: e.timing,
        proxyTiming: e.proxyTiming,
      }),
    );
  };

  studioHooks.onRequestError = (e) => {
    bus.emit(
      createEvent<RequestErrorEvent>(sessionId, {
        id: e.id,
        type: "request:error",
        timestamp: e.timestamp,
        requestId: e.id,
        error: e.error,
      }),
    );
  };

  studioHooks.onRequestAbort = (e) => {
    bus.emit(
      createEvent<RequestAbortEvent>(sessionId, {
        id: e.id,
        type: "request:abort",
        timestamp: e.timestamp,
        requestId: e.id,
        reason: e.reason,
      }),
    );
  };
}
