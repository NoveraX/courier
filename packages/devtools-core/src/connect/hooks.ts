import { devtoolsHooks } from "@noverax/nexus";
import type { EventBus } from "../event-bus";
import type {
  AnyDevToolsEvent,
  MiddlewareEnterEvent,
  MiddlewareErrorEvent,
  MiddlewareExitEvent,
  ProxyClientTimingEvent,
  RequestAbortEvent,
  RequestEndEvent,
  RequestErrorEvent,
  RequestStartEvent,
  ValidationFailEvent,
  ValidationPassEvent,
  ValidationStartEvent,
} from "../events";

/** Create an event with session envelope */
const createEvent = <T extends AnyDevToolsEvent>(
  sessionId: string,
  partial: Omit<T, "sessionId">,
): T => ({ ...partial, sessionId }) as T;

/** Wire all core devtools hooks to emit events on the bus */
export function wireHooks(
  bus: EventBus,
  sessionId: string,
  resolveSourceName: (name: string) => string,
  shouldFilter: (source: string) => boolean,
): void {
  devtoolsHooks.onRequestStart = (e) => {
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

  devtoolsHooks.onRequestEnd = (e) => {
    bus.emit(
      createEvent<RequestEndEvent>(sessionId, {
        id: e.id,
        type: "request:end",
        timestamp: e.timestamp,
        requestId: e.id,
        status: e.status,
        data: e.data,
        headers: e.headers,
        requestHeaders: e.requestHeaders,
        timing: e.timing,
        proxyTiming: e.proxyTiming,
      }),
    );
  };

  devtoolsHooks.onRequestError = (e) => {
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

  devtoolsHooks.onRequestAbort = (e) => {
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
        error: e.error,
      }),
    );
  };

  devtoolsHooks.onValidationStart = (e) => {
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

  devtoolsHooks.onValidationPass = (e) => {
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

  devtoolsHooks.onValidationFail = (e) => {
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

  devtoolsHooks.onProxyClientTiming = (e) => {
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
