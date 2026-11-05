import { CLIENT_LIMITS } from "../client-limits";
import type { ResumeSignal } from "../resume-signals";
import { reconnectNow, type SSEConnectionCtx } from "./sse-connection";

/**
 * What a resume signal does to a stream. One waiting to reconnect does so
 * now — after a little wait at random when the network came back, for every
 * client it dropped at once. One open that has heard nothing from its server
 * for longer than its silence allows, as after the computer slept, is opened
 * again. One heard from lately is left as it is: a stream has no ping to be
 * checked with, and its server comments only every 25 s.
 *
 * @param ctx - The stream's connection loop
 * @param signal - What the page said
 * @param random - Where the wait on `online` is drawn from
 * @example
 * ```ts
 * const stop = onResume((signal) => resumeStream(ctx, signal));
 * ```
 */
export function resumeStream<TData>(
  ctx: SSEConnectionCtx<TData>,
  signal: ResumeSignal,
  random: () => number = Math.random,
): void {
  const waiting = ctx.now;
  if (typeof waiting === "function" && signal === "online") {
    setTimeout(() => {
      if (ctx.now === waiting) reconnectNow(ctx);
    }, random() * CLIENT_LIMITS.RESUME_ONLINE_SPREAD_MS);
  } else if (typeof waiting === "function" || silentTooLong(ctx)) {
    reconnectNow(ctx);
  }
}

function silentTooLong<TData>(ctx: SSEConnectionCtx<TData>): boolean {
  const { heardAt } = ctx;
  return heardAt !== undefined && Date.now() - heardAt > ctx.config.heartbeatTimeout;
}
