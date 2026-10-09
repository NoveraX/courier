import { isStudioEvent } from "@/socket/event-guards";
import { applyEvents } from "@/store/apply-events";
import type { RequestEntry } from "@/store/types-request";
import { MAX_REQUESTS, type RequestLog } from "../request-log";

/**
 * The requests Studio recorded, the newest first, each folded from its
 * events as a page folds the same events when it connects — so an agent
 * reads, audits and replays the requests a person sees.
 *
 * @param requestLog - The events Studio keeps
 * @returns The requests
 * @example
 * ```ts
 * const failed = recordedRequests(requestLog).filter((r) => r.status === "error");
 * ```
 */
export function recordedRequests(requestLog: Pick<RequestLog, "events">): RequestEntry[] {
  return applyEvents([], requestLog.events().filter(isStudioEvent), {
    maxRequests: MAX_REQUESTS,
    ignorePatterns: [],
    paused: false,
  }).requests;
}
