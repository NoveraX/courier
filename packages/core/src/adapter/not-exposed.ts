import { createLogger } from "../logger";
import { isDevelopment } from "../utils/development";

/** How the refused endpoint was reached: a page's call through the proxy, a channel, a stream. */
export type ExposureRefusalTransport = "proxy" | "ws" | "sse";

/* Each said in the terms of what refused it: a channel a WebSocket handler
   serves itself has no proxy in front of it and no routes behind it. */
const SAYINGS: Record<
  ExposureRefusalTransport,
  { readonly log: ReturnType<typeof createLogger>; readonly said: string }
> = {
  proxy: {
    log: createLogger("Proxy"),
    said: "a page called it, and nothing marks it .expose(), so the proxy answered as for an unknown name. Mark it where it is defined if a page may call it, and write the routes again.",
  },
  ws: {
    log: createLogger("WS"),
    said: "a client subscribed to it over WebSocket, and nothing marks it .expose() — on the channel, its group or the API — so the handler refused it as an unknown channel. Mark it where it is defined if clients may subscribe to it.",
  },
  sse: {
    log: createLogger("SSE"),
    said: "a client opened it over SSE, and nothing marks it .expose() — on the stream, its group or the API — so the handler refused it as an unknown stream. Mark it where it is defined if clients may open it.",
  },
};

/* Each endpoint is named once for each way it was reached: a client that
   keeps calling it says nothing new. */
const named = new Set<string>();

/**
 * Say, while developing, that a client reached an endpoint nothing marks
 * for it — most likely one the developer meant to mark, or a routes module
 * written before its mark was taken off. The client is answered as for a
 * name the source does not define either way; only the server's own log
 * says why, in the terms of the transport that refused it, and only outside
 * production, so a client guessing names learns nothing from it.
 *
 * @param endpoint - The endpoint as the refusal names it: `[api][admin][purge]`
 * @param transport - How it was reached: through the proxy, over WebSocket or over SSE
 * @example
 * ```ts
 * if (!isExposedToWire(dataSource, group, schema)) warnNotExposed(`[${source}][${group}][${method}]`, "ws");
 * ```
 */
export function warnNotExposed(endpoint: string, transport: ExposureRefusalTransport): void {
  const key = `${transport}\u0000${endpoint}`;
  if (!isDevelopment() || named.has(key)) return;
  named.add(key);
  const { log, said } = SAYINGS[transport];
  log.warn(`${endpoint}: ${said}`);
}
