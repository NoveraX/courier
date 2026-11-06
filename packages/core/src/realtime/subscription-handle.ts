import { createLogger } from "../logger";
import { OBSERVE_DATA, type ObservableChannel } from "./observe-data";
import { endOf, type LifeObserver, OBSERVE_LIVES, SubscriptionLives } from "./observe-lives";
import { shareRetry } from "./retry-of";
import { DEFAULT_MAX_BUFFER_SIZE } from "./sse/event-queue";
import type { SubscriptionDriver, SubscriptionSink } from "./subscription-driver";
import { SubscriptionInbox } from "./subscription-inbox";
import { SubscriptionListeners } from "./subscription-listeners";
import type {
  StreamEvent,
  Subscription,
  SubscriptionEvent,
  SubscriptionEvents,
} from "./subscription-types";
import type { ConnectionStatus } from "./types";

const log = createLogger("Stream");

type Life = "live" | "ended" | "closed";

/**
 * The one subscription object every kind of stream and channel is: its
 * events, its iteration, its status, `reconnect()` and `close()`. What runs
 * it is its driver; this keeps what a reader sees the same for all of them.
 */
export class SubscriptionHandle<TData> implements Subscription<TData>, ObservableChannel {
  readonly #driver: SubscriptionDriver<TData>;
  readonly #listeners = new SubscriptionListeners<TData>(log);
  readonly #inbox: SubscriptionInbox<TData>;
  readonly #lives = new SubscriptionLives();
  #status: ConnectionStatus = "connecting";
  #life: Life = "live";
  #generation = 0;
  #opens = 0;
  /*
   * The events of what the driver said while the subscription was being
   * made, told once its maker has had the chance to listen. Where it stands
   * is so at once: its status is read, not waited for.
   */
  #early: (() => void)[] | undefined = [];

  constructor(driver: SubscriptionDriver<TData>, maxBufferSize = DEFAULT_MAX_BUFFER_SIZE) {
    this.#driver = driver;
    this.#inbox = new SubscriptionInbox<TData>(maxBufferSize, log);
    shareRetry(this, () => driver.retry?.());
    driver.open(this.#sinkFor(this.#generation));
    const early = this.#early;
    this.#early = undefined;
    if (early && early.length > 0) {
      queueMicrotask(() => {
        for (const emit of early) emit();
      });
    }
  }

  readonly on = <TEvent extends SubscriptionEvent>(
    event: TEvent,
    listener: SubscriptionEvents<TData>[TEvent],
  ): (() => void) => {
    const stop = this.#listeners.add(event, listener);
    if (this.#life === "closed") {
      stop();
      return () => undefined;
    }
    if (event === "data") {
      /* The event names the listener's kind; TypeScript does not narrow one by the other. */
      const onData = listener as SubscriptionEvents<TData>["data"];
      this.#inbox.takeHeld((held) => this.#listeners.call("data", onData, [held.data, held]));
    }
    return stop;
  };

  get status(): ConnectionStatus {
    return this.#status;
  }

  get dropped(): number {
    return this.#inbox.dropped;
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<StreamEvent<TData>> {
    return this.#inbox.iterator(() => this.close());
  }

  /* Its methods are its own, bound: each works passed on alone — an effect's cleanup, a form's handler. */
  readonly reconnect = (): void => {
    if (this.#life === "live") {
      this.#driver.reconnect();
      return;
    }
    if (this.#life === "closed") {
      log.warn("reconnect() does nothing on a subscription that was closed: call it anew");
      return;
    }
    if (this.#driver.reopen === undefined) {
      log.warn("This subscription is served in process and cannot be opened again: call it anew");
      return;
    }
    this.#life = "live";
    this.#inbox.renew(this.#listeners.of("data").size > 0);
    this.#lives.began();
    this.#setStatus("connecting");
    this.#driver.reopen(this.#sinkFor(++this.#generation));
  };

  readonly close = (): void => {
    if (this.#life === "closed") return;
    const live = this.#life === "live";
    this.#life = "closed";
    this.#generation++;
    if (live) this.#driver.close();
    this.#lives.close(live);
    this.#setStatus("disconnected");
    this.#inbox.close();
    if (live) this.#emit("close", { reason: "closed" });
    this.#listeners.clear();
  };

  [OBSERVE_DATA](handler: (data: unknown, event: StreamEvent<unknown>) => void): () => void {
    return this.#inbox.observe(handler);
  }

  [OBSERVE_LIVES](observer: LifeObserver): () => void {
    return this.#lives.watch(observer);
  }

  /* The sink of one life of the subscription: what an earlier life's driver still says is not heard. */
  #sinkFor(generation: number): SubscriptionSink<TData> {
    const act = (run: () => void): void => {
      if (generation === this.#generation) run();
    };
    return {
      connecting: () => act(() => this.#setStatus("connecting")),
      reconnecting: () => act(() => this.#setStatus("reconnecting")),
      open: ({ resumed }) => act(() => this.#opened(resumed)),
      data: (event) => act(() => this.#inbox.deliver(event, this.#listeners)),
      error: (error) => act(() => this.#emit("error", error)),
      end: (error) => act(() => this.#end(error)),
    };
  }

  #opened(resumed: boolean): void {
    const first = this.#opens++ === 0;
    this.#setStatus("connected");
    this.#emit("open", { first, resumed: !first && resumed });
  }

  #end(error: Error | undefined): void {
    if (this.#life !== "live") return;
    this.#life = "ended";
    /* This life's loop ends before anyone is told, so a listener that opens
       the subscription again opens a life of its own, and is not told of this
       one's end after it: what it hears next is the new life's. */
    this.#inbox.end(error);
    const generation = this.#generation;
    /* Listeners hear a RealtimeError; the loop rejects with the error as it came. */
    const info = endOf(error);
    /* Watchers hear the end first: a listener told of it below may open a life of its own. */
    this.#lives.ended(info);
    if (info.reason === "failed") this.#emit("error", info.error);
    if (generation !== this.#generation) return;
    this.#setStatus("disconnected");
    if (generation !== this.#generation) return;
    this.#emit("close", info);
  }

  /* A status reached while the subscription was being made is where it stands, with nobody yet to tell. */
  #setStatus(status: ConnectionStatus): void {
    if (status === this.#status) return;
    this.#status = status;
    if (this.#early === undefined) this.#listeners.emit("status", status);
  }

  #emit<TEvent extends Exclude<SubscriptionEvent, "status" | "data">>(
    event: TEvent,
    ...args: Parameters<SubscriptionEvents<TData>[TEvent]>
  ): void {
    if (this.#early) this.#early.push(() => this.#listeners.emit(event, ...args));
    else this.#listeners.emit(event, ...args);
  }
}
