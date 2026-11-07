import { ONCE } from "../../utils/own";
import type { SSEConnectionCtx } from "./sse-connection";

/**
 * The wait before a stream's next connection. While it lasts, `ctx.now` is
 * how it is reached: called with nothing it ends the wait now, as
 * `reconnectNow` and the subscription's end do; called with a moment, by
 * the clock that does not jump, it brings the end forward to it — never
 * puts it off — as a page's signal does when the server asked for a wait.
 *
 * @param ms - How long it lasts
 * @param ctx - The subscription's connection loop
 * @returns Settles when it is over
 * @example
 * ```ts
 * await waitToReconnect(delay, ctx);
 * ```
 */
export function waitToReconnect<TData>(ms: number, ctx: SSEConnectionCtx<TData>): Promise<void> {
  if (ms === 0) return Promise.resolve();
  const { signal } = ctx.controller;
  return new Promise((resolve) => {
    let due = performance.now() + ms;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wake = (at?: number): void => {
      const now = performance.now();
      if (at !== undefined && at > now) {
        if (at >= due) return;
        due = at;
        clearTimeout(timer);
        timer = setTimeout(() => wake(), at - now);
        return;
      }
      clearTimeout(timer);
      signal.removeEventListener("abort", end);
      if (ctx.now === wake) ctx.now = undefined;
      resolve();
    };
    const end = (): void => wake();
    timer = setTimeout(() => wake(), ms);
    signal.addEventListener("abort", end, ONCE);
    ctx.now = wake;
  });
}
