import type { PlaygroundHistoryEntry } from "./types-ui"
import { PLAYGROUND_MAX_HISTORY } from "./constants"

export const PLAYGROUND_HISTORY_KEY = "courier-studio-v2-playground-history"

/* An answer bigger than this is not kept across reloads; its entry says so. */
const MAX_KEPT_ANSWER = 64 * 1024
/* A stream keeps its latest messages. */
const MAX_KEPT_CHUNKS = 50

const INTERRUPTED = "The page was reloaded before the answer arrived."

/**
 * The Playground history this browser kept, as it was before the page reloaded.
 *
 * A call still running then never gets its answer, so it is shown as
 * interrupted rather than as pending for good.
 *
 * @returns The entries, newest first; none when nothing was kept or it cannot be read
 *
 * @example
 * ```ts
 * playgroundHistory: loadPlaygroundHistory()
 * ```
 */
export function loadPlaygroundHistory(): PlaygroundHistoryEntry[] {
  try {
    const raw = localStorage.getItem(PLAYGROUND_HISTORY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isEntry).slice(0, PLAYGROUND_MAX_HISTORY).map(settled)
  } catch (err) {
    console.warn("The Playground history this browser kept could not be read", err)
    return []
  }
}

/**
 * Keep the Playground history in this browser, for the next time the page loads.
 *
 * @param entries - The history, newest first
 *
 * @example
 * ```ts
 * savePlaygroundHistory(useStudioStore.getState().playgroundHistory)
 * ```
 */
export function savePlaygroundHistory(entries: readonly PlaygroundHistoryEntry[]): void {
  try {
    localStorage.setItem(PLAYGROUND_HISTORY_KEY, JSON.stringify(entries.map(kept)))
  } catch (err) {
    console.warn("The Playground history could not be kept in this browser", err)
  }
}

function kept(entry: PlaygroundHistoryEntry): PlaygroundHistoryEntry {
  const chunks = entry.chunks?.slice(-MAX_KEPT_CHUNKS)
  const size = JSON.stringify(entry.response ?? null).length
  const response =
    size > MAX_KEPT_ANSWER ? `The answer (${size} characters) was too large to keep across reloads.` : entry.response
  return { ...entry, response, ...(chunks && { chunks }) }
}

function settled(entry: PlaygroundHistoryEntry): PlaygroundHistoryEntry {
  if (entry.status !== "pending") return entry
  return {
    ...entry,
    status: "error",
    response: INTERRUPTED,
    ...(entry.streamStatus && { streamStatus: "error" }),
  }
}

function isEntry(value: unknown): value is PlaygroundHistoryEntry {
  if (typeof value !== "object" || value === null) return false
  const field = (key: string): unknown => Reflect.get(value, key)
  const status = field("status")
  return (
    ["id", "rid", "source", "method"].every((key) => typeof field(key) === "string") &&
    (status === "pending" || status === "success" || status === "error")
  )
}
