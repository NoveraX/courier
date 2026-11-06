import { ConnectionError, RealtimeError } from "./errors";
import { markFinal } from "./final-errors";
import type { CloseInfo, Subscription } from "./subscription-types";

/**
 * The method by which a subscription tells the lives it goes through: a
 * server may end one, and `reconnect()` open the next.
 */
export const OBSERVE_LIVES = Symbol.for("courier.subscription.observe-lives");

/** What hears each life of a subscription end, and the next begin. */
export interface LifeObserver {
  /** A life ended: the server completed or failed it, or the application closed it, which is the last. */
  ended(info: CloseInfo): void;
  /** A life after one that ended began: `reconnect()` opened the subscription again. */
  began(): void;
}

/** A subscription that tells its lives. */
export interface LivingSubscription {
  /**
   * Hear each life end and the next begin, before the subscription's
   * listeners hear of it.
   *
   * @returns Stops hearing them
   */
  [OBSERVE_LIVES](observer: LifeObserver): () => void;
}

/**
 * Hear each life of a subscription end and the next begin, as Studio's
 * instrumentation does. A life's end is heard before the subscription's own
 * listeners hear of it, so one that opens the subscription again from a
 * listener — of its `error`, its `status` or its `close` — is heard as a
 * new life, whether or not the old one's `close` is ever told. A
 * subscription that cannot be opened again has one life, ending with its
 * `close`.
 *
 * @param subscription - The subscription or channel
 * @param observer - Hears each life end, and the next begin
 * @returns Stops hearing them
 * @example
 * ```ts
 * observeLives(subscription, { ended: (info) => record(info), began: () => recordAnew() });
 * ```
 */
export function observeLives(
  subscription: Subscription<unknown>,
  observer: LifeObserver,
): () => void {
  return isLiving(subscription)
    ? subscription[OBSERVE_LIVES](observer)
    : subscription.on("close", (info) => observer.ended(info));
}

function isLiving(subscription: object): subscription is LivingSubscription {
  return typeof Reflect.get(subscription, OBSERVE_LIVES) === "function";
}

/**
 * How a life of a subscription ended, from what its driver ended it with:
 * completed, or failed with a `RealtimeError` — one of another kind is
 * told as a `ConnectionError` with its message — marked as the error the
 * subscription ends on.
 *
 * @param error - What the driver ended the life with, if anything
 * @returns How the life ended
 * @example
 * ```ts
 * endOf(new Error("socket hang up")); // { reason: "failed", error: ConnectionError }
 * ```
 */
export function endOf(error: Error | undefined): CloseInfo {
  if (error === undefined) return { reason: "completed" };
  const failure = error instanceof RealtimeError ? error : new ConnectionError(error.message);
  markFinal(failure);
  return { reason: "failed", error: failure };
}

/**
 * Who watches the lives of a subscription, and how its last one ended: one
 * that starts watching after a life ended is told how at once — a
 * subscription can end while it is being made, before anything watches it.
 */
export class SubscriptionLives {
  readonly #observers = new Set<LifeObserver>();
  #ended: CloseInfo | undefined;
  #closed = false;

  /** Watch the lives; nothing is told once the subscription closed. */
  watch(observer: LifeObserver): () => void {
    if (this.#closed) return () => undefined;
    if (this.#ended) observer.ended(this.#ended);
    this.#observers.add(observer);
    return () => this.#observers.delete(observer);
  }

  /** A life ended. */
  ended(info: CloseInfo): void {
    this.#ended = info;
    for (const observer of [...this.#observers]) observer.ended(info);
  }

  /** A life after one that ended began. */
  began(): void {
    this.#ended = undefined;
    for (const observer of [...this.#observers]) observer.began();
  }

  /** The application closed the subscription: its life ended so, when one was live, and there is no other. */
  close(live: boolean): void {
    if (live) this.ended({ reason: "closed" });
    this.#closed = true;
    this.#observers.clear();
  }
}
