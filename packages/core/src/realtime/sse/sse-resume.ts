import { CLIENT_LIMITS } from "../client-limits";
import type { ResumeSignal } from "../resume-signals";
import { reconnectNow, type SSEConnectionCtx } from "./sse-connection";

/**
 * What a resume signal does to a stream. One waiting to reconnect does so
 * now — after a little wait at random when the network came back, for every
 * client it dropped at once — unless its server asked for a wait, a 429's
 * `Retry-After` or a shutdown's `retry:`: that is kept, the stream comes
 * back a little at random after it, and its failures in a row stay counted.
 * One open that has heard nothing from its server for longer than its
 * silence allows, as after the computer slept, is opened again. One heard
 * from lately is left as it is: a stream has no ping to be checked with,
 * and its server comments only every 25 s.
 *
 * @param ctx - The stream's connection loop
 * @param signal - What the page said
 * @param random - Where the little wait at random is drawn from
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
  if (typeof waiting !== "function") {
    if (silentTooLong(ctx)) reconnectNow(ctx);
    return;
  }
  const { notBefore } = ctx;
  const spread = random() * CLIENT_LIMITS.RESUME_ONLINE_SPREAD_MS;
  if (notBefore !== undefined && performance.now() < notBefore) {
    waiting(notBefore + spread);
  } else if (signal === "online") {
    setTimeout(() => {
      if (ctx.now === waiting) reconnectNow(ctx);
    }, spread);
  } else {
    reconnectNow(ctx);
  }
}

function silentTooLong<TData>(ctx: SSEConnectionCtx<TData>): boolean {
  const { heardAt } = ctx;
  return heardAt !== undefined && Date.now() - heardAt > ctx.config.heartbeatTimeout;
}
