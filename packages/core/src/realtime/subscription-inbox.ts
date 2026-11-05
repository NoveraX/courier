import type { ScopedLogger } from "../logger";
import { createEventQueue, type EventQueue } from "./sse/event-queue";
import type { SubscriptionListeners } from "./subscription-listeners";
import type { StreamEvent } from "./subscription-types";

type Observer<TData> = (data: unknown, event: StreamEvent<TData>) => void;

/**
 * Where a subscription's data goes: to its observers and data listeners as
 * it comes, and to its loop. What comes before anything reads is kept, within
 * its bound, for the first reader — a listener, or the loop.
 */
export class SubscriptionInbox<TData> {
  readonly #observers = new Set<Observer<TData>>();
  #queue: EventQueue<TData>;
  #droppedBefore = 0;
  #iterating = false;
  #taken = false;

  constructor(
    private readonly maxBufferSize: number,
    private readonly log: ScopedLogger,
  ) {
    this.#queue = createEventQueue<TData>(maxBufferSize);
  }

  /** What was dropped over the bound, in every life of the subscription. */
  get dropped(): number {
    return this.#droppedBefore + this.#queue.dropped;
  }

  /** A life after the last ended: nothing of it kept; already read when `read` — a listener stayed. */
  renew(read: boolean): void {
    this.#droppedBefore += this.#queue.dropped;
    this.#queue = createEventQueue<TData>(this.maxBufferSize);
    this.#iterating = false;
    this.#taken = read;
  }

  /** The loop over what comes, and what was kept; `left` is told when the loop is left early. */
  iterator(left: () => void): AsyncIterableIterator<StreamEvent<TData>> {
    this.#iterating = true;
    this.#taken = true;
    return this.#queue.iterator(() => {
      this.#iterating = false;
      left();
    });
  }

  /* The first reader takes what came before anything read. */
  takeHeld(take: (held: StreamEvent<TData>) => void): void {
    if (this.#taken || this.#iterating) return;
    this.#taken = true;
    for (const held of this.#queue.drain()) take(held);
  }

  /** Watch the data without reading it: what is kept is seen first, and stays for the first reader. */
  observe(observer: Observer<TData>): () => void {
    for (const held of this.#queue.peek()) observer(held.data, held);
    this.#observers.add(observer);
    return () => this.#observers.delete(observer);
  }

  /** Hand an event to the observers and `listeners`' data listeners, and keep it for whoever reads later. */
  deliver(event: StreamEvent<TData>, listeners: SubscriptionListeners<TData>): void {
    for (const observer of [...this.#observers]) {
      try {
        observer(event.data, event);
      } catch (error) {
        this.log.error("A subscription's observer failed", error);
      }
    }
    const readers = listeners.of("data");
    for (const listener of [...readers]) listeners.call("data", listener, [event.data, event]);
    const unread = readers.size === 0 && !this.#taken;
    if (this.#iterating || unread) this.#queue.push(event);
  }

  /** The subscription ended: the loop ends after what is kept, or rejects with `error`. */
  end(error?: Error): void {
    if (error) this.#queue.fail(error);
    else this.#queue.finish();
  }

  /** The subscription was closed: the loop ends, nothing is kept, nobody observes. */
  close(): void {
    this.#queue.finish();
    this.#queue.clear();
    this.#observers.clear();
  }
}
