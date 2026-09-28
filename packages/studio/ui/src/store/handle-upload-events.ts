import type { RequestEntry } from "./types"
import { num, optStr, str } from "./event-helpers"

type EventPayload = Record<string, unknown>

/**
 * A request first seen through its upload's progress.
 *
 * A browser reports an upload before the proxy has announced the call, so
 * its row starts from the progress, under the id the proxy then adopts; the
 * call's own `request:start` fills in the rest when it arrives.
 *
 * @param event - An `upload:progress` event naming its endpoint
 * @returns The pending row, or `undefined` when the event names no endpoint
 *
 * @example
 * ```ts
 * requestFromUpload({ requestId: "up_1", source: "api", method: "upload", loaded: 1, total: 4, percentage: 25 })
 * ```
 */
export function requestFromUpload(event: EventPayload): RequestEntry | undefined {
  const method = optStr(event.method)
  if (!method) return undefined
  return withUploadProgress(
    {
      id: str(event.requestId),
      source: str(event.source),
      group: optStr(event.group),
      method,
      variables: undefined,
      mode: "proxy",
      status: "pending",
      middlewareCount: 0,
      middlewareEntries: [],
      hasValidation: { variables: false, response: false },
      startedAt: num(event.timestamp, Date.now()),
      sessionId: str(event.sessionId),
    },
    event,
  )
}

/**
 * The row with the upload's progress so far.
 *
 * @param r - The request
 * @param event - An `upload:progress` event
 * @returns The request with its upload state
 *
 * @example
 * ```ts
 * withUploadProgress(request, { loaded: 2, total: 4, percentage: 50 })
 * ```
 */
export function withUploadProgress(r: RequestEntry, event: EventPayload): RequestEntry {
  const percentage = Math.min(100, Math.max(0, num(event.percentage)))
  return {
    ...r,
    upload: {
      loaded: num(event.loaded),
      total: num(event.total),
      percentage,
      done: r.upload?.done === true || percentage >= 100,
    },
  }
}

/**
 * The row with its upload sent in full.
 *
 * @param r - The request
 * @returns The request, its upload done
 *
 * @example
 * ```ts
 * withUploadComplete(request)
 * ```
 */
export function withUploadComplete(r: RequestEntry): RequestEntry {
  const upload = r.upload ?? { loaded: 0, total: 0, percentage: 100, done: true }
  return { ...r, upload: { ...upload, percentage: 100, done: true } }
}
