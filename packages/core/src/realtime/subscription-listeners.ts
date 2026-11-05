import { ConfigurationError } from "../errors/configuration-error";
import type { ScopedLogger } from "../logger";
import type { SubscriptionEvent, SubscriptionEvents } from "./subscription-types";

const EVENTS: readonly SubscriptionEvent[] = ["data", "error", "status", "open", "close"];

type ListenerSets<TData> = {
  [TEvent in SubscriptionEvent]: Set<SubscriptionEvents<TData>[TEvent]>;
};

/**
 * A subscription's listeners, kept by event: only its own five events are
 * taken, and one listener that throws keeps the event from none of the others.
 */
export class SubscriptionListeners<TData> {
  readonly #sets: ListenerSets<TData> = {
    data: new Set(),
    error: new Set(),
    status: new Set(),
    open: new Set(),
    close: new Set(),
  };

  constructor(private readonly log: ScopedLogger) {}

  /**
   * Add a listener.
   *
   * @throws {ConfigurationError} `UNKNOWN_EVENT` for an event subscriptions do not have
   */
  add<TEvent extends SubscriptionEvent>(
    event: TEvent,
    listener: SubscriptionEvents<TData>[TEvent],
  ): () => void {
    const set = this.setOf(event);
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  /** The listeners of an event, for a caller that must hand them more than one value. */
  of<TEvent extends SubscriptionEvent>(
    event: TEvent,
  ): ReadonlySet<SubscriptionEvents<TData>[TEvent]> {
    return this.#sets[event];
  }

  /** Tell every listener of an event; one that throws is logged, and the rest are still told. */
  emit<TEvent extends SubscriptionEvent>(
    event: TEvent,
    ...args: Parameters<SubscriptionEvents<TData>[TEvent]>
  ): void {
    for (const listener of [...this.#sets[event]]) this.call(event, listener, args);
  }

  /** Call one listener as `emit` does. */
  call<TEvent extends SubscriptionEvent>(
    event: TEvent,
    listener: SubscriptionEvents<TData>[TEvent],
    args: Parameters<SubscriptionEvents<TData>[TEvent]>,
  ): void {
    try {
      (listener as (...values: Parameters<SubscriptionEvents<TData>[TEvent]>) => void)(...args);
    } catch (error) {
      this.log.error(`A subscription's ${event} listener failed`, error);
    }
  }

  /** Let go of every listener: nothing a closed subscription did is told. */
  clear(): void {
    for (const event of EVENTS) this.#sets[event].clear();
  }

  private setOf<TEvent extends SubscriptionEvent>(
    event: TEvent,
  ): Set<SubscriptionEvents<TData>[TEvent]> {
    if (!EVENTS.includes(event)) {
      throw new ConfigurationError(
        "UNKNOWN_EVENT",
        `[courier] A subscription has no "${String(event)}" event: it has ${EVENTS.map((name) => `"${name}"`).join(", ")}. ` +
          "Each kind — a stream, a push channel, a channel with .send() — has the same five, and is read with for await too.",
      );
    }
    return this.#sets[event];
  }
}
