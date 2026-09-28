import type { RequestEntry } from "./types"

export interface MergeReplayedOptions {
  /** How many requests the list keeps. */
  maxRequests: number
  /** While recording is paused, a replay brings no request the page does not hold. */
  paused: boolean
}

/**
 * Merge the requests Studio replayed with the ones the page holds.
 *
 * A replayed request replaces the page's copy — it carries the events the
 * page missed while disconnected — and keeps its pin. A request Studio no
 * longer has, as after Studio restarted, stays as the page held it.
 *
 * @param held - The requests the page holds, newest first
 * @param replayed - The requests rebuilt from the replay
 * @param options - The cap, and whether recording is paused
 * @returns The merged list, newest first
 *
 * @example
 * ```ts
 * const requests = mergeReplayed(state.requests, replayed, { maxRequests: 2000, paused: false })
 * ```
 */
export function mergeReplayed(
  held: RequestEntry[],
  replayed: RequestEntry[],
  { maxRequests, paused }: MergeReplayedOptions,
): RequestEntry[] {
  const heldById = new Map(held.map((r) => [r.id, r]))
  const merged: RequestEntry[] = []
  const replayedIds = new Set<string>()
  for (const request of replayed) {
    const mine = heldById.get(request.id)
    if (paused && !mine) continue
    replayedIds.add(request.id)
    merged.push(mine?.pinned ? { ...request, pinned: true } : request)
  }
  for (const request of held) if (!replayedIds.has(request.id)) merged.push(request)
  return merged.sort((a, b) => b.startedAt - a.startedAt).slice(0, maxRequests)
}
