import { createLogger } from "../logger";
import { isDevelopment } from "../utils/development";

/* Said in the terms of the handler that refused it: a channel or a stream
   a server serves itself has no proxy in front of it and no routes behind
   it. Kept apart from the proxy's saying, which a page's code carries. */
const SAID = {
  ws: {
    log: createLogger("WS"),
    said: "a client subscribed to it over WebSocket, and nothing marks it .expose() — on the channel, its group or the API — so the handler refused it as an unknown channel. Mark it where it is defined if clients may subscribe to it.",
  },
  sse: {
    log: createLogger("SSE"),
    said: "a client opened it over SSE, and nothing marks it .expose() — on the stream, its group or the API — so the handler refused it as an unknown stream. Mark it where it is defined if clients may open it.",
  },
};

/* Each endpoint is named once for each handler that refused it: a client
   that keeps reaching it says nothing new. */
const named = new Set<string>();

/**
 * Say, while developing, that a client reached over WebSocket or SSE an
 * endpoint nothing marks for it — most likely one the developer meant to
 * mark. The handler refused it as one that does not exist; only the
 * server's own log says why, and only outside production, so a client
 * guessing names learns nothing from it.
 *
 * @param endpoint - The endpoint as the refusal names it: `[api][live][room]`
 * @param transport - The handler that refused it
 * @example
 * ```ts
 * if (!isExposedToWire(dataSource, group, schema)) warnRealtimeNotExposed(name, "ws");
 * ```
 */
export function warnRealtimeNotExposed(endpoint: string, transport: "ws" | "sse"): void {
  const key = `${transport}\u0000${endpoint}`;
  if (!isDevelopment() || named.has(key)) return;
  named.add(key);
  const { log, said } = SAID[transport];
  log.warn(`${endpoint}: ${said}`);
}
