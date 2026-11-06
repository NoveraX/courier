import { observeData } from "../../realtime/observe-data";
import { observeLives } from "../../realtime/observe-lives";
import type { StreamEvent, Subscription } from "../../realtime/subscription-types";
import { beginStream, type StreamInstrumentation, type StreamMeta } from "./core";
import { watchConnection } from "./watch-connection";

/**
 * Show a subscription in Studio: each event it delivers, how its connection
 * stands as it changes — being opened, open, being opened again with why the
 * last one ended — and how it ended. It is watched, not wrapped: the caller
 * holds the subscription it was given, and when Studio's hooks are not
 * installed nothing is done at all. One the server ended and `reconnect()`
 * opened again is a new entry, given what it delivers from then on.
 *
 * Lifecycle reasons:
 * - `complete` — the server finished it
 * - `disconnect` — the caller closed it, or left its loop early
 * - `error` — the server failed or refused it
 *
 * @param subscription - The subscription
 * @param meta - What Studio shows it as
 * @param existingInstr - The entry Studio already opened for it, when there is one
 * @returns The same subscription
 */
export function instrumentSSE<TSubscription extends Subscription<unknown>>(
  subscription: TSubscription,
  meta: StreamMeta,
  existingInstr?: StreamInstrumentation | null,
): TSubscription {
  const instr = existingInstr ?? beginStream(meta);
  if (instr) {
    watchSubscription(subscription, instr, (data, event) => instr.emitMessage(data, event.event));
  }
  return subscription;
}

/**
 * Tell Studio what a subscription delivers, how its connection stands, and
 * how each of its lives ended: one the server ended may be opened again,
 * and each time it is, its Studio entry is a new one. Watching ends with
 * the subscription, once the application closes it.
 *
 * @param subscription - The subscription or channel
 * @param instr - Its Studio entry
 * @param onData - Records one delivery
 */
export function watchSubscription(
  subscription: Subscription<unknown>,
  instr: StreamInstrumentation,
  onData: (data: unknown, event: StreamEvent<unknown>) => void,
): void {
  let stopLife = watchLife(subscription, instr, onData);
  observeLives(subscription, {
    ended: (info) => {
      stopLife();
      if (info.reason === "failed") instr.emitError(info.error);
      else instr.emitClose(info.reason === "closed" ? "disconnect" : "complete");
    },
    began: () => {
      instr.reopen();
      stopLife = watchLife(subscription, instr, onData);
    },
  });
}

/* One life of a subscription: what it delivers and how its connection stands, until it ends. */
function watchLife(
  subscription: Subscription<unknown>,
  instr: StreamInstrumentation,
  onData: (data: unknown, event: StreamEvent<unknown>) => void,
): () => void {
  const unwatch = watchConnection(subscription, instr.emitStatus);
  const unobserve = observeData(subscription, onData);
  return () => {
    unwatch();
    unobserve();
  };
}
