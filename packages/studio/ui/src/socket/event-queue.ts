/**
 * How long runtime events wait to be applied together: about one frame, so
 * a burst costs the page one store update per frame however many events it
 * carries, and a lone event still shows at once.
 */
export const EVENT_FLUSH_MS = 16;

export interface EventQueue<TEvent> {
  /** Queue an event; the batch it joins is applied within `EVENT_FLUSH_MS`. */
  push: (event: TEvent) => void;
  /** Apply what is queued now, without waiting. */
  flush: () => void;
}

/**
 * Gather events that arrive close together and hand them over in one batch.
 *
 * @param apply - Takes each batch, oldest event first
 * @param delayMs - How long the first event of a batch waits for others
 * @returns The queue to push events into
 *
 * @example
 * ```ts
 * const queue = createEventQueue((events) => store().handleEvents(events))
 * socket.on("events", (events) => events.forEach(queue.push))
 * ```
 */
export function createEventQueue<TEvent>(
  apply: (events: TEvent[]) => void,
  delayMs: number = EVENT_FLUSH_MS,
): EventQueue<TEvent> {
  let pending: TEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  function applyPending(): void {
    timer = undefined;
    const batch = pending;
    pending = [];
    if (batch.length > 0) apply(batch);
  }

  return {
    push(event) {
      pending.push(event);
      timer ??= setTimeout(applyPending, delayMs);
    },
    flush() {
      if (timer !== undefined) clearTimeout(timer);
      applyPending();
    },
  };
}
