import type { StoredEvent, StreamAdapter } from "./adapters";

const DEFAULT_MAX_SIZE = 1000;

interface MemoryStreamOptions {
  /** Max events per topic before auto-trim (default 1000) */
  maxSize?: number | undefined;
}

/**
 * In-process stream adapter for single-server or testing.
 * Stores events in memory with auto-trim on append.
 * Uses binary search for O(log n) Last-Event-ID resume.
 *
 * @example
 * ```ts
 * const stream = createMemoryStream({ maxSize: 500 });
 * await stream.connect();
 * const id = await stream.append("events.chat", { data: "hello", timestamp: Date.now() });
 * const history = await stream.getHistory("events.chat", "0", 50);
 * ```
 */
export function createMemoryStream(options?: MemoryStreamOptions): StreamAdapter {
  const maxSize = options?.maxSize ?? DEFAULT_MAX_SIZE;
  const topics = new Map<string, StoredEvent[]>();
  const counters = new Map<string, number>();
  const errorHandlers = new Set<(error: Error) => void>();
  let connected = false;

  function getOrCreate(topic: string): StoredEvent[] {
    let events = topics.get(topic);
    if (!events) {
      events = [];
      topics.set(topic, events);
    }
    return events;
  }

  function nextId(topic: string): string {
    const counter = (counters.get(topic) ?? 0) + 1;
    counters.set(topic, counter);
    return String(counter);
  }

  /** Binary search: find index of first event with id > afterId */
  function findStartIndex(events: StoredEvent[], afterId: string): number {
    const targetNum = Number(afterId);
    let lo = 0;
    let hi = events.length;

    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (Number(events[mid]?.id) <= targetNum) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  return {
    async connect() {
      connected = true;
    },

    async disconnect() {
      connected = false;
      topics.clear();
      counters.clear();
      errorHandlers.clear();
    },

    isHealthy() {
      return connected;
    },

    onError(handler) {
      errorHandlers.add(handler);
      return () => {
        errorHandlers.delete(handler);
      };
    },

    async append(topic, event) {
      const id = nextId(topic);
      const stored: StoredEvent = { ...event, id };
      const events = getOrCreate(topic);
      events.push(stored);

      // Auto-trim: keep only the most recent maxSize events
      if (events.length > maxSize) {
        const overflow = events.length - maxSize;
        events.splice(0, overflow);
      }

      return id;
    },

    async getHistory(topic, afterId, limit = 100) {
      const events = topics.get(topic);
      if (!events || events.length === 0) return [];

      const startIdx = findStartIndex(events, afterId);
      return events.slice(startIdx, startIdx + limit);
    },

    async trim(topic, maxLen) {
      const events = topics.get(topic);
      if (!events) return;

      if (events.length > maxLen) {
        const overflow = events.length - maxLen;
        events.splice(0, overflow);
      }
    },
  };
}
