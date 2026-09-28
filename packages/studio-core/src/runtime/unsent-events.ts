import { createLogger } from "@noverax/courier";
import type { AnyStudioEvent } from "../events";

const log = createLogger("Studio");

/**
 * How many events a runtime keeps while its Studio socket is not connected.
 * The oldest are dropped past this, so a runtime whose Studio never comes up
 * cannot grow without end.
 */
const MAX_UNSENT_EVENTS = 1000;

/** Events reported while the Studio socket was not connected, kept to send once it is. */
export interface UnsentEvents {
  /** Keep an event until the socket connects. */
  keep(event: AnyStudioEvent): void;
  /**
   * Hand over what was kept, oldest first, and forget it.
   *
   * @returns The events kept since the last call
   */
  take(): AnyStudioEvent[];
}

/**
 * Keep the events a runtime reports while it cannot send them.
 *
 * `attachRuntime()` resolves before its socket connects, and a page fetches
 * its data as it loads, so the first requests an application made were
 * dropped and never reached Studio. So were the ones made while Studio
 * restarted. None of them was ever sent, so sending them late cannot repeat
 * one.
 *
 * @returns The store of unsent events
 * @example
 * ```ts
 * const unsent = keepUnsentEvents();
 * unsent.keep(event);
 * socket.on("connect", () => {
 *   for (const kept of unsent.take()) socket.emit("event", kept);
 * });
 * ```
 */
export function keepUnsentEvents(): UnsentEvents {
  let kept: AnyStudioEvent[] = [];
  let dropWarned = false;

  return {
    keep(event) {
      kept.push(event);
      if (kept.length <= MAX_UNSENT_EVENTS) return;
      kept.shift();
      if (dropWarned) return;
      dropWarned = true;
      log.warn(
        `Studio has not been reachable for more than ${MAX_UNSENT_EVENTS} events; the oldest are dropped`,
      );
    },
    take() {
      const taken = kept;
      kept = [];
      return taken;
    },
  };
}
