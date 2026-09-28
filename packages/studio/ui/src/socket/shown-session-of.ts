import type { RequestEntry } from "@/store/types"
import type { ShownSession } from "@/store/store-types"
import { requestFromSaved } from "@/views/settings/saved-request"

import { isPlainObject } from "./is-plain-object"

/** A saved session Studio says the pages show, as the store takes it */
export interface ShownSessionPayload {
  session: ShownSession
  requests: RequestEntry[]
}

/**
 * Read the saved session Studio sends a page that connects while the pages
 * show one; each request Studio cannot read is left out.
 *
 * @param data - What Studio sent with `view:session`
 * @returns The session and its requests, or `undefined` for anything else
 *
 * @example
 * ```ts
 * shownSessionOf({ id: "s1", name: "login flow", requests: [] })?.session.name // "login flow"
 * ```
 */
export function shownSessionOf(data: unknown): ShownSessionPayload | undefined {
  if (!isPlainObject(data) || !Array.isArray(data.requests)) return undefined
  if (typeof data.id !== "string" || typeof data.name !== "string") return undefined
  const requests = data.requests
    .map(requestFromSaved)
    .filter((request): request is RequestEntry => request !== undefined)
  return { session: { id: data.id, name: data.name }, requests }
}
