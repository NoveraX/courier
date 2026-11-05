import type { TopicPosition } from "./server-frame-types";
import type { Subscription } from "./topic-subscription";

/**
 * What an event's number, or a skip's, says for a subscription: the next
 * event, one counted already, or one past the next — the events between
 * lost to it, as a server that drops frames loses them.
 */
export type Count = "next" | "counted" | "gap";

/**
 * Count an event or a skip numbered `seq` in a subscription's position.
 * Until the server has confirmed the subscription its position is not
 * known — `subscribed` gives it — so nothing is counted then, and every
 * event is delivered: those sent again, and those of the handler's start.
 *
 * @param s - The subscription
 * @param seq - The event's number in the topic's sequence
 * @returns What the number says
 * @example
 * ```ts
 * countEvent(subscription, 42); // → "next" at 41, the position now 42
 * ```
 */
export function countEvent(s: Subscription, seq: number): Count {
  const { position } = s;
  if (!s.confirmed || position === undefined) return "next";
  if (seq <= position.seq) return "counted";
  const next = position.seq + 1;
  position.seq = seq;
  return seq === next ? "next" : "gap";
}

/**
 * The server runs a subscription, its topic's sequence at `position`: the
 * subscription stands there from now on, whatever came before. It resumed
 * when the server says every event it missed was sent and nothing broke
 * the sequence meanwhile.
 *
 * @param s - The subscription
 * @param position - Where the topic's sequence stands
 * @param recovered - What the server said of the events missed, for a subscribe that sent `since`
 * @returns Whether the subscription resumed: nothing was missed
 * @example
 * ```ts
 * const resumed = startAt(subscription, frame.position, frame.recovered);
 * ```
 */
export function startAt(
  s: Subscription,
  position: TopicPosition,
  recovered: boolean | undefined,
): boolean {
  s.position = { seq: position.seq, epoch: position.epoch };
  const resumed = recovered === true && !s.broken;
  s.broken = false;
  return resumed;
}

/**
 * The server cannot vouch for what a subscription missed: its sequence goes
 * on from `position`. A running subscription's subscribers hear it did not
 * resume; one still to be confirmed hears it with the confirmation.
 *
 * @param s - The subscription
 * @param position - Where the topic's sequence goes on from
 * @example
 * ```ts
 * restart(subscription, { seq: 7, epoch: "n3w" });
 * ```
 */
export function restart(s: Subscription, position: TopicPosition): void {
  s.position = { seq: position.seq, epoch: position.epoch };
  if (s.confirmed) brokeOff(s);
  else s.broken = true;
}

/**
 * Tell a subscription's subscribers that what they hold may be stale: the
 * open they hear says it did not resume, and the state is to be read again.
 *
 * @param s - The subscription
 * @example
 * ```ts
 * if (countEvent(subscription, seq) === "gap") brokeOff(subscription);
 * ```
 */
export function brokeOff(s: Subscription): void {
  for (const subscriber of [...s.subscribers]) subscriber.open?.({ resumed: false });
}
