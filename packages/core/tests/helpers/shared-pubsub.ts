import type { PubSubAdapter, PubSubEnvelope } from "../../src/realtime/adapters";

type Listener = (envelope: PubSubEnvelope) => void;

/**
 * One message bus shared by several pub/sub adapters, as replicas share a
 * Redis server: what one publishes reaches every other one subscribed to
 * the channel, and not itself.
 *
 * @returns A factory for one replica's adapter, named by its origin
 */
export function createSharedBus(): (origin: string) => PubSubAdapter {
  const channels = new Map<string, Set<Listener>>();

  return (origin) => ({
    async connect() {},
    async disconnect() {},
    isHealthy: () => true,
    onError: () => () => {},
    async publish(channel, message) {
      const envelope: PubSubEnvelope = { origin, payload: message, timestamp: Date.now() };
      for (const listener of channels.get(channel) ?? []) listener(envelope);
    },
    async subscribe(channel, handler) {
      const listener: Listener = (envelope) => {
        if (envelope.origin !== origin) handler(envelope.payload);
      };
      const listeners = channels.get(channel) ?? new Set<Listener>();
      listeners.add(listener);
      channels.set(channel, listeners);
      return () => listeners.delete(listener);
    },
  });
}
