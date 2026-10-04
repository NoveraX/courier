/**
 * Studio hook wiring orchestrator.
 *
 * `attachRuntime()` calls `wireHooks` (request lifecycle + middleware +
 * validation + stream) and `wireHttpHooks` (HTTP fetch + proxy + cache +
 * dedup/upload) ONCE per process when running in dev mode. The wirers
 * assign to `studioHooks.on*` slots; subsequent calls overwrite the
 * previous slots — `attachRuntime`'s idempotent handle map prevents that
 * scenario, so we don't need any guard inside the wirers.
 *
 * The two-tier split (`wireHooks` + `wireHttpHooks`) is preserved from the
 * pre-6.1.8b shape so the call graph stays familiar across the codebase.
 * Both functions take a `bus` + `sessionId` + (optional) `resolveSourceName`
 * resolver. The resolver lets per-event source-name normalization use the
 * same global registry consumed by the playground responder.
 */

import type { EventBus } from "../../event-bus";
import type { HttpVersions } from "../http-versions/http-version";
import { wireCacheHooks } from "./http-cache";
import { wireFetchHooks } from "./http-fetch";
import { wireDedupUploadHooks } from "./http-misc";
import { wireProxyHooks } from "./http-proxy";
import { wireMiddlewareHooks } from "./middleware";
import { wireRequestHooks } from "./request";
import { wireStreamHooks } from "./stream";
import { wireValidationHooks } from "./validation";

/** Wire request lifecycle, middleware, validation, and stream hooks to the bus. */
export function wireHooks(
  bus: EventBus,
  sessionId: string,
  resolveSourceName: (name: string) => string,
): void {
  wireRequestHooks(bus, sessionId, resolveSourceName);
  wireMiddlewareHooks(bus, sessionId);
  wireValidationHooks(bus, sessionId);
  wireStreamHooks(bus, sessionId, resolveSourceName);
}

/** Wire HTTP, proxy, cache, dedup, and upload hooks to the bus, each answer told with the HTTP version it came over when known. */
export function wireHttpHooks(
  bus: EventBus,
  sessionId: string,
  resolveSourceName: (name: string) => string,
  versions?: HttpVersions | undefined,
): void {
  wireFetchHooks(bus, sessionId, versions);
  wireProxyHooks(bus, sessionId, resolveSourceName);
  wireCacheHooks(bus, sessionId);
  wireDedupUploadHooks(bus, sessionId);
}
