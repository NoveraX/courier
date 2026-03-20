import { devtoolsHooks } from "../devtools";
import type { Middleware } from "./types";

/** Emit onMiddlewareExit event with self-time and per-phase breakdown */
export function emitExit(
  rid: string,
  mw: Middleware,
  i: number,
  t0: number,
  innerTime: number[],
  headersAdded: string[],
  rawBeforeTime: number,
  rawAfterTime: number,
): void {
  const dt = devtoolsHooks;
  if (!dt.onMiddlewareExit) return;

  const wallTime = performance.now() - t0;
  const inner = innerTime[i] ?? 0;
  const selfTime = wallTime - inner;
  if (i > 0) innerTime[i - 1] = (innerTime[i - 1] ?? 0) + wallTime;

  // For wrap, rawAfterTime includes inner chain — correct to self-time only
  const beforeDuration = rawBeforeTime;
  const afterDuration = mw.phase === "wrap" ? Math.max(0, selfTime - rawBeforeTime) : rawAfterTime;

  dt.onMiddlewareExit?.({
    requestId: rid,
    name: mw.name,
    index: i,
    duration: selfTime,
    phase: mw.phase,
    beforeDuration,
    afterDuration,
    headersAdded,
    timestamp: Date.now(),
  });
}

/** Propagate wall time to parent middleware's inner-time accumulator */
export function propagateInner(i: number, t0: number, innerTime: number[]): void {
  const wallTime = performance.now() - t0;
  if (i > 0) innerTime[i - 1] = (innerTime[i - 1] ?? 0) + wallTime;
}

/** Capture current header keys for later diffing */
export function snapshotHeaders(headers: Headers): Set<string> {
  const keys = new Set<string>();
  for (const [k] of headers) keys.add(k.toLowerCase());
  return keys;
}

/** Find header keys added since the snapshot */
export function diffHeaders(before: Set<string>, headers: Headers): string[] {
  const added: string[] = [];
  for (const [k] of headers) {
    if (!before.has(k.toLowerCase())) added.push(k);
  }
  return added;
}
