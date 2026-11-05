import { randomId } from "../utils/random-id";
import type {
  AdapterState,
  LoggedPosition,
  PubSubAdapter,
  PubSubEnvelope,
  TopicLog,
} from "./adapters";
import { createMemoryTopicLogs, type MemoryTopicLogOptions } from "./memory-topic-log";

type Listener = (envelope: PubSubEnvelope) => void;
type Handler = (message: unknown, logged?: LoggedPosition) => void;

/** What a memory bus keeps besides its channels. */
export interface MemoryBusOptions {
  /** A log every replica shares, which numbers each topic's events in one sequence */
  log?: MemoryTopicLogOptions | undefined;
}

/** One bus in this process, which several handlers' adapters share as replicas share a Redis server. */
export interface MemoryBus {
  /**
   * The adapter of one replica on the bus: what it publishes reaches every
   * other replica subscribed to the channel, never itself.
   *
   * @param origin - The replica's name, unique on the bus; one is made up when left out
   */
  replica(origin?: string): PubSubAdapter;
}

/**
 * A pub/sub bus inside one process: the handlers of a server that runs
 * several of them, and tests that stand two or three replicas side by side,
 * share it as replicas share Redis. Each replica's adapter is ready from the
 * start and keeps to the whole contract a handler relies on. A message
 * reaches the other replicas on a microtask, as one over a network arrives
 * after the call that sent it.
 *
 * @returns The bus
 * @example
 * ```ts
 * const bus = createMemoryBus();
 * const a = createWSHandler({ pubsub: bus.replica("a") });
 * const b = createWSHandler({ pubsub: bus.replica("b") });
 * ```
 */
export function createMemoryBus(options: MemoryBusOptions = {}): MemoryBus {
  const channels = new Map<string, Set<Listener>>();
  const logFor = options.log ? createMemoryTopicLogs(channels, options.log) : undefined;
  return {
    replica(origin = `mem_${randomId()}`) {
      return memoryReplica(channels, origin, logFor?.(origin));
    },
  };
}

function memoryReplica(
  channels: Map<string, Set<Listener>>,
  origin: string,
  log: TopicLog | undefined,
): PubSubAdapter {
  const own = new Map<string, { handlers: Set<Handler>; listener: Listener }>();
  const errorHandlers = new Set<(error: Error) => void>();
  const stateListeners = new Set<(state: AdapterState) => void>();
  let state: AdapterState = "ready";
  let published = 0;
  let delivered = 0;

  function emitError(error: unknown): void {
    const reported = error instanceof Error ? error : new Error(String(error));
    for (const handler of [...errorHandlers]) handler(reported);
  }

  function listen(handlers: Set<Handler>): Listener {
    return (envelope) => {
      /* A replica's own events reach it too, once a log has numbered them. */
      if (envelope.origin === origin && !envelope.logged) return;
      for (const handler of [...handlers]) {
        delivered++;
        try {
          handler(envelope.payload, envelope.logged);
        } catch (error) {
          emitError(error);
        }
      }
    };
  }

  function leave(channel: string): void {
    const held = own.get(channel);
    if (!held) return;
    own.delete(channel);
    const listeners = channels.get(channel);
    listeners?.delete(held.listener);
    if (listeners?.size === 0) channels.delete(channel);
  }

  function refuseStopped(): Promise<never> {
    return Promise.reject(new Error(`The pub/sub adapter of replica ${origin} was stopped`));
  }

  return {
    log: log && {
      ...log,
      append(topic, payload, exclude) {
        if (state === "stopped") return refuseStopped();
        published++;
        return log.append(topic, payload, exclude);
      },
    },
    get state() {
      return state;
    },
    async connect() {
      if (state === "stopped") await refuseStopped();
    },
    async disconnect() {
      if (state === "stopped") return;
      for (const channel of [...own.keys()]) leave(channel);
      state = "stopped";
      for (const listener of [...stateListeners]) listener(state);
      stateListeners.clear();
      errorHandlers.clear();
    },
    isHealthy: () => state === "ready",
    onError(handler) {
      errorHandlers.add(handler);
      return () => errorHandlers.delete(handler);
    },
    onStateChange(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    publish(channel, message) {
      if (state === "stopped") return refuseStopped();
      published++;
      const envelope: PubSubEnvelope = { origin, payload: message, timestamp: Date.now() };
      queueMicrotask(() => {
        for (const listener of [...(channels.get(channel) ?? [])]) listener(envelope);
      });
      return Promise.resolve();
    },
    subscribe(channel, handler) {
      if (state === "stopped") return refuseStopped();
      let held = own.get(channel);
      if (!held) {
        const handlers = new Set<Handler>();
        held = { handlers, listener: listen(handlers) };
        own.set(channel, held);
        const listeners = channels.get(channel) ?? new Set<Listener>();
        listeners.add(held.listener);
        channels.set(channel, listeners);
      }
      const { handlers } = held;
      handlers.add(handler);
      return Promise.resolve(() => {
        if (
          handlers.delete(handler) &&
          handlers.size === 0 &&
          own.get(channel)?.handlers === handlers
        )
          leave(channel);
      });
    },
    stats() {
      const held = state === "stopped" ? 0 : own.size;
      return {
        state,
        channels: { wanted: held, confirmed: held },
        queued: { messages: 0, bytes: 0 },
        dropped: 0,
        published,
        delivered,
      };
    },
  };
}
