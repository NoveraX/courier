import { isFailedState, requestStateOf } from "@/features/requests/request-state";
import type { RequestEntry } from "@/store/types";
import type { GraphBranch } from "./graph-types";

/** A call running along its endpoint's branch on the graph, as it ended. */
export interface Pulse {
  id: string;
  /** The way it runs, fixed as it starts so a new layout does not move it. */
  path: string;
  /** How long it runs, in ms. */
  duration: number;
  tone: "ok" | "warn" | "err";
}

/* A call runs at about this speed, in graph units a second, within these bounds in ms. */
const SPEED = 560;
const SHORTEST = 650;
const LONGEST = 1_500;

/**
 * How a call shows on its way: red when it failed, amber when it took
 * longer than the slow-request threshold, blue otherwise.
 *
 * @param r - The call
 * @param slowMs - Studio's slow-request threshold
 * @returns Its tone
 * @example
 * ```ts
 * pulseToneOf(call, 500); // "warn" for a call that took 800 ms
 * ```
 */
export function pulseToneOf(r: RequestEntry, slowMs: number): Pulse["tone"] {
  if (isFailedState(requestStateOf(r))) return "err";
  return (r.timing?.total ?? 0) > slowMs ? "warn" : "ok";
}

/**
 * A call's pulse along its endpoint's branch, running the longer the
 * longer the way.
 *
 * @param r - The call
 * @param branch - Its endpoint's branch
 * @param slowMs - Studio's slow-request threshold
 * @returns The pulse
 * @example
 * ```ts
 * pulseOf(call, layout.branches.get("api.users.list"), 500).duration; // 1100
 * ```
 */
export function pulseOf(r: RequestEntry, branch: GraphBranch, slowMs: number): Pulse {
  const duration = Math.min(LONGEST, Math.max(SHORTEST, (branch.length / SPEED) * 1000));
  return {
    id: r.id,
    path: branch.path,
    duration: Math.round(duration),
    tone: pulseToneOf(r, slowMs),
  };
}

/**
 * The calls that ended since the graph last looked: a call
 * ends when it stops being pending — a stream as it opens. Each is marked
 * seen, so it is never shown again; a cancelled call is marked and not
 * shown at all.
 *
 * @param requests - Every call Studio holds
 * @param seen - The calls already looked at, which this adds to
 * @returns The calls to show
 * @example
 * ```ts
 * endedCalls(requests, seen); // [] when nothing ended since
 * ```
 */
export function endedCalls(requests: readonly RequestEntry[], seen: Set<string>): RequestEntry[] {
  const ended: RequestEntry[] = [];
  for (const r of requests) {
    const state = requestStateOf(r);
    if (state === "pending" || seen.has(r.id)) continue;
    seen.add(r.id);
    if (state !== "aborted") ended.push(r);
  }
  return ended;
}
