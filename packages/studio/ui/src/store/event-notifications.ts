import { readShared } from "@noverax/courier-studio-core";
import { toast } from "sonner";

import { isDemoVisitor } from "@/features/demo/is-demo-visitor";

import { isRecord } from "./event-helpers";
import type { StudioState } from "./store-types";
import type { RequestEntry } from "./types";

type EventPayload = Record<string, unknown>;
type Getter = () => StudioState;

// ── Event-driven Sonner notifications ───────────────────────────────────────

/**
 * Toast the failures and slow requests among a batch of events the store
 * just took in, a toast a request: a read another call's request answered
 * is told with that request — a failed one says how many calls it failed —
 * and a slow toast is never one for a read that only waited on it. A
 * burst that fails many requests at once is told in one toast, not one
 * per request; a call its caller cancelled is no failure. A visitor of a
 * public demo is told of none: the traffic is every visitor's.
 *
 * @param events - The events of the batch, oldest first
 * @param get - Reads the store after the batch was applied
 *
 * @example
 * ```ts
 * notifyOnEvents(batch, get)
 * ```
 */
export function notifyOnEvents(events: EventPayload[], get: Getter): void {
  const { settings, requests, studioInfo } = get();
  /* A demo's traffic is every visitor's, not this one's to be told of. */
  if (isDemoVisitor(studioInfo)) return;
  const failed = settings.toastOnError
    ? events.filter((e) => e.type === "request:error" && !cancelled(e))
    : [];
  const slow = settings.toastOnSlowRequest
    ? events.filter(
        (e) =>
          e.type === "request:end" && !sharedEvent(e) && totalOf(e) > settings.slowRequestThreshold,
      )
    : [];
  if (failed.length === 0 && slow.length === 0) return;

  const labelOf = labeller(requests);
  if (failed.length > 0) notifyFailed(failed, labelOf);
  for (const event of slow.slice(-MAX_SLOW_TOASTS)) notifySlowRequest(event, labelOf);
}

/** A burst of slow requests is told by its latest few. */
const MAX_SLOW_TOASTS = 3;

/* A call its caller cancelled — a component gone, a newer read in its place — did not fail. */
function cancelled(event: EventPayload): boolean {
  return isRecord(event.error) && event.error.type === "aborted";
}

/* The event of a call whose read another call's request answered, with no request of its own. */
function sharedEvent(event: EventPayload): boolean {
  return readShared(event.shared) !== undefined;
}

function totalOf(event: EventPayload): number {
  const timing = event.timing as { total?: number } | undefined;
  return typeof timing?.total === "number" ? timing.total : -1;
}

function labeller(requests: RequestEntry[]): (event: EventPayload) => string {
  const byId = new Map(requests.map((r) => [r.id, r]));
  return (event) => {
    const entry = byId.get(String(event.requestId ?? ""));
    if (entry) return [entry.source, entry.group, entry.method].filter(Boolean).join(".");
    return String(event.method ?? "unknown");
  };
}

function notifyFailed(failed: EventPayload[], labelOf: (event: EventPayload) => string): void {
  const sent = failed.filter((e) => !sharedEvent(e));
  const last = sent.at(-1);
  if (last === undefined) return;
  const latest = labelOf(last);
  const calls = callsNote(failed, sent);
  if (sent.length === 1) toast.error(`Request failed: ${latest}${calls}`);
  else toast.error(`${sent.length} requests failed, the latest ${latest}${calls}`);
}

/* The calls the failed requests failed, where reads that shared their answers failed with them. */
function callsNote(failed: EventPayload[], sent: EventPayload[]): string {
  const owners = new Set(sent.map((e) => String(e.requestId ?? "")));
  const joined = failed.filter((e) => owners.has(readShared(e.shared)?.with ?? "")).length;
  return joined === 0 ? "" : ` (${sent.length + joined} calls)`;
}

function notifySlowRequest(event: EventPayload, labelOf: (event: EventPayload) => string): void {
  const ms = Math.round(totalOf(event));
  const message = `Slow request: ${labelOf(event)} (${ms}ms)`;

  // Match request-row color: >1s = red (error), >threshold = yellow (warning)
  if (ms > 1000) {
    toast.error(message);
  } else {
    toast.warning(message);
  }
}
