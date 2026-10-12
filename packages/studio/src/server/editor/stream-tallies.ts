import { isPlainObject } from "../is-plain-object";

type RuntimeEvent = Record<string, unknown>;

/** How an endpoint's streams went: opened, still open, failed, and the latest failure. */
export interface StreamTally {
  opened: number;
  open: number;
  failed: number;
  lastAt?: number;
  lastFailure?: { at: number; message: string; request: string };
}

interface Stream {
  id: string;
  key: string;
  at: number;
  ended: boolean;
  failure?: string;
}

/**
 * How each endpoint's streams and channels went, from the events Studio
 * keeps: a stream is counted once however often it is announced, open
 * until it closes, failed when it ends with an error.
 *
 * @param events - The events Studio's request log keeps
 * @param keyOf - The key an endpoint is tallied by, from its source and its call in the client
 * @returns The tallies, by key
 * @example
 * ```ts
 * streamTallies(requestLog.keyEvents(), (source, id) => `${source} ${id}`).get("shop live.orders")?.open;
 * ```
 */
export function streamTallies(
  events: readonly RuntimeEvent[],
  keyOf: (source: string, endpoint: string) => string,
): Map<string, StreamTally> {
  const streams = new Map<string, Stream>();
  for (const event of events) {
    const id = event.requestId;
    if (typeof id !== "string") continue;
    if (event.type === "stream:open" && !streams.has(id)) {
      const group = typeof event.group === "string" && event.group !== "" ? `${event.group}.` : "";
      const key = keyOf(String(event.source), `${group}${String(event.method)}`);
      streams.set(id, {
        id,
        key,
        at: typeof event.timestamp === "number" ? event.timestamp : 0,
        ended: false,
      });
    }
    const stream = streams.get(id);
    if (!stream) continue;
    if (event.type === "stream:close") {
      stream.ended = true;
      if (event.reason === "error") stream.failure ??= "The stream ended with an error";
    } else if (event.type === "stream:error") {
      stream.ended = true;
      stream.failure =
        typeof event.error === "string"
          ? event.error
          : isPlainObject(event.error)
            ? String(event.error.message)
            : "The stream failed";
    }
  }
  return tally(streams.values());
}

function tally(streams: Iterable<Stream>): Map<string, StreamTally> {
  const tallies = new Map<string, StreamTally>();
  for (const stream of streams) {
    const current = tallies.get(stream.key) ?? { opened: 0, open: 0, failed: 0 };
    current.opened += 1;
    if (!stream.ended) current.open += 1;
    current.lastAt = Math.max(current.lastAt ?? 0, stream.at);
    if (stream.failure !== undefined) {
      current.failed += 1;
      if (stream.at >= (current.lastFailure?.at ?? 0))
        current.lastFailure = { at: stream.at, message: stream.failure, request: stream.id };
    }
    tallies.set(stream.key, current);
  }
  return tallies;
}
