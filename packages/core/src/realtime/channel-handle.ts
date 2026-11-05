import type { SubscriptionDriver } from "./subscription-driver";
import { SubscriptionHandle } from "./subscription-handle";

/** The method a channel's sent messages are watched by, as Studio's instrumentation watches them. */
export const OBSERVE_SENT = Symbol.for("courier.channel.observe-sent");

/**
 * A subscription the caller sends on as well: the one subscription object,
 * and `send`. What `send` answers is the driver's — whether a message went
 * out or waits to over a socket; a promise of its handling in process.
 */
export class ChannelHandle<TSend, TReceive, TSent = boolean> extends SubscriptionHandle<TReceive> {
  readonly #sender: (data: TSend) => TSent;
  readonly #sentObservers = new Set<(data: unknown) => void>();

  constructor(driver: SubscriptionDriver<TReceive>, sender: (data: TSend) => TSent) {
    super(driver);
    this.#sender = sender;
  }

  /* Bound, as the subscription's methods are: a form's handler may be `channel.send` itself. */
  readonly send = (data: TSend): TSent => {
    const sent = this.#sender(data);
    /* A message is told sent once the channel took it: over a socket, it says so; in process, it takes what comes while it is open. */
    const taken = typeof sent === "boolean" ? sent : this.status !== "disconnected";
    if (taken) for (const observer of [...this.#sentObservers]) observer(data);
    return sent;
  };

  /** Hear each message the channel took to send. */
  [OBSERVE_SENT](observer: (data: unknown) => void): () => void {
    this.#sentObservers.add(observer);
    return () => this.#sentObservers.delete(observer);
  }
}
