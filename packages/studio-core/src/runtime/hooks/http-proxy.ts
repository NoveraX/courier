import { studioHooks } from "@noverax/nexus";
import type { EventBus } from "../../event-bus";
import type {
  AnyStudioEvent,
  ProxyOriginRejectEvent,
  ProxyParseEvent,
  ProxyReceiveEvent,
  ProxyRespondEvent,
} from "../../events";

/** Create an event with session envelope */
const createEvent = <TEvent extends AnyStudioEvent>(
  sessionId: string,
  partial: Omit<TEvent, "sessionId">,
): TEvent => ({ ...partial, sessionId }) as TEvent;

/** Wire proxy hooks to the bus */
export function wireProxyHooks(
  bus: EventBus,
  sessionId: string,
  resolveSourceName: (name: string) => string,
): void {
  studioHooks.onProxyReceive = (e) => {
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

  studioHooks.onProxyRespond = (e) => {
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

  studioHooks.onProxyParse = (e) => {
    bus.emit(
      createEvent<ProxyParseEvent>(sessionId, {
        id: `proxy_${Date.now().toString(36)}`,
        type: "proxy:parse",
        timestamp: e.timestamp,
        source: resolveSourceName(e.source),
        group: e.group,
        method: e.method,
        variables: e.variables,
      }),
    );
  };

  studioHooks.onProxyOriginReject = (e) => {
    bus.emit(
      createEvent<ProxyOriginRejectEvent>(sessionId, {
        id: `proxy_${Date.now().toString(36)}`,
        type: "proxy:origin-reject",
        timestamp: e.timestamp,
        origin: e.origin,
        allowedOrigins: [],
      }),
    );
  };
}
