import { studioHooks } from "@noverax/courier/internal";
import type { EventBus } from "../../event-bus";
import type {
  AnyStudioEvent,
  RequestAbortEvent,
  RequestEndEvent,
  RequestErrorEvent,
  RequestStartEvent,
} from "../../events";

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
): void {
  studioHooks.onRequestStart = (e) => {
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
        ...(e.httpMethod && { httpMethod: e.httpMethod }),
        ...(e.endpointType && { endpointType: e.endpointType }),
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
        ...(e.proxyTiming && { proxyTiming: e.proxyTiming }),
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
        error: {
          type: e.error.type,
          message: e.error.message,
          ...(e.error.status !== undefined && { status: e.error.status }),
        },
        ...(e.status !== undefined && { status: e.status }),
        ...(e.headers && { headers: e.headers }),
        ...(e.data !== undefined && { data: e.data }),
        ...(e.size !== undefined && { size: e.size }),
        ...(e.timing && { timing: e.timing }),
        ...(e.proxyTiming && { proxyTiming: e.proxyTiming }),
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
