import { requestFromSaved } from "@/features/sessions/saved-request";
import { environmentOf } from "@/features/sessions/session-environment";
import type { ShownSession } from "@/store/store-types";
import type { RequestEntry } from "@/store/types";

import { isPlainObject } from "./is-plain-object";

/** A saved session Studio says the pages show, as the store takes it */
export interface ShownSessionPayload {
  session: ShownSession;
  requests: RequestEntry[];
}

/**
 * Read the saved session Studio sends a page that connects while the pages
 * show one, with the environment it was recorded in when it was opened from
 * a session file; each request Studio cannot read is left out.
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
  if (!isPlainObject(data) || !Array.isArray(data.requests)) return undefined;
  if (typeof data.id !== "string" || typeof data.name !== "string") return undefined;
  const requests = data.requests
    .map(requestFromSaved)
    .filter((request): request is RequestEntry => request !== undefined);
  const environment = environmentOf(data.environment);
  return {
    session: { id: data.id, name: data.name, ...(environment && { environment }) },
    requests,
  };
}
