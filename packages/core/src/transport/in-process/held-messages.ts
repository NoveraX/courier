import { createLogger } from "../../logger";

const log = createLogger("WS");

/**
 * How many messages a channel holds for a data listener that has not come
 * yet. The oldest are dropped past this, so a channel nobody listens to
 * cannot grow without end.
 */
const MAX_HELD_MESSAGES = 1024;

/** Messages an in-process channel sent before anything listened to it. */
export interface HeldMessages {
  /**
   * Keep a message while nothing has listened yet.
   *
   * @returns `false` once the messages were released, when it is to be delivered
   */
  hold(data: unknown): boolean;
  /**
   * Stop holding and hand over what was held, oldest first.
   *
   * @returns The held messages; none on every call after the first
   */
  release(): readonly unknown[];
}

/**
 * Hold what an in-process channel sends until its first data listener.
 *
 * A caller listens once `executeDirectWSChannel` resolves, which is after
 * `onJoin` ran, so what `onJoin` sent reached nobody — where a socket's
 * client receives it, as the first thing on the connection.
 *
 * @param topic - The channel's topic, named when messages are dropped
 * @returns The held messages
 * @example
 * ```ts
 * const early = holdMessages("api.chat.room");
 * early.hold({ text: "welcome" }); // → true
 * early.release(); // → [{ text: "welcome" }]
 * early.hold({ text: "later" }); // → false
 * ```
 */
export function holdMessages(topic: string): HeldMessages {
  let held: unknown[] | null = [];
  let dropWarned = false;

  return {
    hold(data) {
      if (!held) return false;
      held.push(data);
      if (held.length > MAX_HELD_MESSAGES) {
        held.shift();
        if (!dropWarned) {
          dropWarned = true;
          log.warn(
            `Channel ${topic} sent more than ${MAX_HELD_MESSAGES} messages before anything listened; the oldest are dropped`,
          );
        }
      }
      return true;
    },
    release() {
      const released = held ?? [];
      held = null;
      return released;
    },
  };
}
