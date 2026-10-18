import { str } from "./event-helpers";
import { withCacheHit, withCacheMiss } from "./handle-cache-events";
import {
  withMiddlewareEnter,
  withMiddlewareError,
  withMiddlewareExit,
} from "./handle-middleware-events";
import { withProxyParse, withRepeatedStart } from "./handle-proxy-events";
import {
  requestFromStart,
  withFetchStart,
  withHttpVersion,
  withProxyClientTiming,
  withRequestEnd,
  withRequestError,
  withValidationFail,
} from "./handle-request-events";
import {
  streamFromOpen,
  withStreamClose,
  withStreamError,
  withStreamMessage,
  withStreamOpen,
} from "./handle-stream-events";
import { withStreamStatus } from "./handle-stream-status";
import { requestFromUpload, withUploadComplete, withUploadProgress } from "./handle-upload-events";
import { withValidationOutcome } from "./handle-validation-events";
import type { RequestDraft } from "./request-draft";
import type { RequestEntry, StudioEvent } from "./types";
import { validationIssuesOf } from "./validation-issues";

type EventPayload = StudioEvent & Record<string, unknown>;

/**
 * Fold one runtime event into the request list being drafted. Events for a
 * request the list does not hold, and events the list has nothing to show
 * for, change nothing.
 *
 * @param draft - The request list a batch of events is changing
 * @param event - The runtime event
 *
 * @example
 * ```ts
 * const draft = createRequestDraft(state.requests)
 * for (const event of batch) applyEvent(draft, event)
 * ```
 */
export function applyEvent(draft: RequestDraft, event: EventPayload): void {
  const requestId = str(event.requestId);
  switch (event.type) {
    case "request:start": {
      const id = str(event.id);
      if (draft.has(id)) draft.update(id, (r) => withRepeatedStart(r, event));
      else draft.add(requestFromStart(event));
      return;
    }
    case "upload:progress": {
      if (draft.has(requestId)) {
        draft.update(requestId, (r) => withUploadProgress(r, event));
        return;
      }
      const entry = requestFromUpload(event);
      if (entry) draft.add(entry);
      return;
    }
    case "stream:open":
      if (draft.has(requestId)) draft.update(requestId, (r) => withStreamOpen(r, event));
      else draft.add(streamFromOpen(event));
      return;
    case "validation:fail": {
      const issues = validationIssuesOf(event.issues);
      draft.update(requestId, (r) => {
        const failed = withValidationOutcome(r, event.target, "failed");
        return issues ? withValidationFail(failed, issues) : failed;
      });
      return;
    }
  }
  const change = ENTRY_CHANGES.get(event.type);
  if (change) draft.update(requestId, (r) => change(r, event));
}

type EntryChange = (r: RequestEntry, event: EventPayload) => RequestEntry;

/** What each event that updates a known request does to it. */
const ENTRY_CHANGES: ReadonlyMap<string, EntryChange> = new Map<string, EntryChange>([
  ["request:end", withRequestEnd],
  ["request:error", withRequestError],
  ["middleware:enter", withMiddlewareEnter],
  ["middleware:exit", withMiddlewareExit],
  ["middleware:error", withMiddlewareError],
  ["http:fetch:start", withFetchStart],
  ["http:fetch:end", withHttpVersion],
  ["http:fetch:error", withHttpVersion],
  ["proxy:client-timing", withProxyClientTiming],
  ["stream:message", withStreamMessage],
  ["stream:close", withStreamClose],
  ["stream:error", withStreamError],
  ["stream:status", withStreamStatus],
  ["cache:hit", withCacheHit],
  ["cache:miss", withCacheMiss],
  ["upload:complete", withUploadComplete],
  ["proxy:parse", withProxyParse],
  ["validation:pass", (r, event) => withValidationOutcome(r, event.target, "passed")],
]);
