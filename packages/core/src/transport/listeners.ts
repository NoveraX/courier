/**
 * Listeners kept by event name, each typed by the value its event carries.
 *
 * @example
 * ```ts
 * const listeners = new Listeners<{ status: ConnectionStatus }>();
 * const stop = listeners.add("status", (status) => console.log(status));
 * listeners.emit("status", "connected");
 * stop();
 * ```
 */
export class Listeners<TEvents> {
  private readonly byEvent = new Map<keyof TEvents, Set<(value: never) => void>>();

  /**
   * Listen to an event.
   *
   * @param event - Its name
   * @param handler - Called with each value it carries
   * @returns Stops listening
   */
  readonly add = <TEvent extends keyof TEvents>(
    event: TEvent,
    handler: (value: TEvents[TEvent]) => void,
  ): (() => void) => {
    const set = this.byEvent.get(event) ?? new Set();
    set.add(handler);
    this.byEvent.set(event, set);
    return () => {
      set.delete(handler);
    };
  };

  /**
   * Hand a value to every listener of an event.
   *
   * @param event - Its name
   * @param value - What it carries
   */
  emit<TEvent extends keyof TEvents>(event: TEvent, value: TEvents[TEvent]): void {
    for (const handler of this.byEvent.get(event) ?? []) {
      /* Each set holds only the handlers `add` stored under its own event. */
      (handler as (value: TEvents[TEvent]) => void)(value);
    }
  }
}
