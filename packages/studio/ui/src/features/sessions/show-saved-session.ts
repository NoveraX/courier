import { post } from "@/lib/api-client";
import { useStudioStore } from "@/store";
import { isRecord } from "@/store/event-helpers";
import type { RequestEntry } from "@/store/types";
import { requestFromSaved } from "./saved-request";
import { environmentOf } from "./session-environment";

/** The saved session shown, as a toast tells it. */
export interface ShownSaved {
  name: string;
  requests: number;
}

/**
 * Show a saved session in place of the live requests: Studio loads it and
 * keeps it shown, across a reload, until the page goes back to live, and
 * recording pauses so live traffic does not mix into it. A session opened
 * from a file brings the environment it was recorded in.
 *
 * @param id - The saved session's id
 * @returns The session shown, or `undefined` when Studio sent no session
 * @throws {StudioRequestError} When Studio refused to load it
 * @example
 * ```ts
 * const shown = await showSavedSession("3f2a9c1e");
 * ```
 */
export async function showSavedSession(id: string): Promise<ShownSaved | undefined> {
  const session = await post<unknown>("/api/sessions/load", { id });
  if (!isRecord(session) || !Array.isArray(session.requests)) return undefined;
  const requests = session.requests
    .map(requestFromSaved)
    .filter((r): r is RequestEntry => r !== undefined);
  const name = String(session.name);
  const environment = environmentOf(session.environment);
  useStudioStore
    .getState()
    .showSession({ id, name, ...(environment && { environment }) }, requests);
  return { name, requests: requests.length };
}
