import type { PubSubAdapter, PubSubEnvelope } from "./adapters";

/**
 * Lazy-evaluated origin ID — uses crypto.randomUUID when available
 * (browser + node 14.17+) and falls back to Math.random for legacy
 * environments. Lazy so the module-load cost stays zero.
 */
let cachedOrigin: string | null = null;
function getDefaultOrigin(): string {
  if (cachedOrigin) return cachedOrigin;
  cachedOrigin = `mem_${generateOriginId()}`;
  return cachedOrigin;
}

function generateOriginId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

type EnvelopeHandler = (envelope: PubSubEnvelope) => void;

/**
 * In-process pub/sub adapter for single-server or testing.
 * Zero external dependencies — uses a simple Map<topic, Set<handler>> internally.
 *
 * @example
 * ```ts
 * const pubsub = createMemoryPubSub();
 * await pubsub.connect();
 * await pubsub.subscribe("chat.room1", (msg) => console.log(msg));
 * await pubsub.publish("chat.room1", { text: "hello" });
 * ```
 */
export function createMemoryPubSub(origin?: string): PubSubAdapter {
  const id = origin ?? getDefaultOrigin();
  const topics = new Map<string, Set<EnvelopeHandler>>();
  const errorHandlers = new Set<(error: Error) => void>();
  let connected = false;

  function getOrCreate(topic: string): Set<EnvelopeHandler> {
    let handlers = topics.get(topic);
    if (!handlers) {
      handlers = new Set();
      topics.set(topic, handlers);
    }
    return handlers;
  }

  function emitError(error: Error): void {
    for (const handler of errorHandlers) {
      handler(error);
    }
  }

  return {
    async connect() {
      connected = true;
    },

    async disconnect() {
      connected = false;
      topics.clear();
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

    async publish(topic, message) {
      if (!connected) return;

      const envelope: PubSubEnvelope = {
        origin: id,
        payload: message,
        timestamp: Date.now(),
      };

      const handlers = topics.get(topic);
      if (!handlers) return;

      for (const handler of handlers) {
        try {
          handler(envelope);
        } catch (err) {
          emitError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    },

    async subscribe(topic, handler) {
      const wrappedHandler: EnvelopeHandler = (envelope) => {
        // Echo prevention — skip messages from self
        if (envelope.origin === id) return;
        handler(envelope.payload);
      };

      const handlers = getOrCreate(topic);
      handlers.add(wrappedHandler);

      return () => {
        handlers.delete(wrappedHandler);
        if (handlers.size === 0) topics.delete(topic);
      };
    },
  };
}
