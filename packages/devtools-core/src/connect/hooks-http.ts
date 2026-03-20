import type { EventBus } from "../event-bus";
import { wireCacheHooks } from "./hooks-http-cache";
import { wireFetchHooks } from "./hooks-http-fetch";
import { wireDedupUploadHooks } from "./hooks-http-misc";
import { wireProxyHooks } from "./hooks-http-proxy";

/** Wire HTTP, proxy, cache, dedup, and upload hooks to the bus */
export function wireHttpHooks(
  bus: EventBus,
  sessionId: string,
  resolveSourceName: (name: string) => string,
  shouldFilter: (source: string) => boolean,
): void {
  wireFetchHooks(bus, sessionId);
  wireProxyHooks(bus, sessionId, resolveSourceName, shouldFilter);
  wireCacheHooks(bus, sessionId);
  wireDedupUploadHooks(bus, sessionId);
}
