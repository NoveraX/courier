import type { AnswerObservations } from "../storage/answer-observations";

/** Reads the runtime events an answer's shape is matched to its endpoint by. */
export interface AnswerObserver {
  /**
   * Take a runtime event: a call's start and its address are noted, and an
   * answer's shape counted for its endpoint.
   *
   * @returns Whether the event was an answer's shape, which goes to no page and no log
   */
  see(event: Record<string, unknown>): boolean;
}

/* The calls whose answer may still come: enough for any burst, never a leak. */
const MOST_OPEN_CALLS = 5000;
const ENDED = new Set(["request:end", "request:error", "request:abort"]);

/**
 * Follow the runtime events that tell which endpoint an answer's shape
 * belongs to: a call's start names its source and endpoint, its fetch the
 * host it went to, and its shape — sent before the response schema reads
 * the answer — is counted for that endpoint, from that host. A call that
 * ended is forgotten.
 *
 * @param observations - Where shapes are counted
 * @param now - The clock
 * @returns The observer
 * @example
 * ```ts
 * const observer = createAnswerObserver(stores.answers);
 * if (!observer.see(event)) broadcast(event);
 * ```
 */
export function createAnswerObserver(
  observations: AnswerObservations,
  now: () => number = Date.now,
): AnswerObserver {
  const calls = new Map<string, { source: string; endpoint: string; place?: string | undefined }>();
  return {
    see(event) {
      const { type } = event;
      if (type === "request:start") {
        const call = callOf(event);
        if (call) remember(calls, call.id, { source: call.source, endpoint: call.endpoint });
        return false;
      }
      if (type === "http:fetch:start") {
        const call = calls.get(String(event.requestId));
        if (call && typeof event.url === "string") call.place = hostOf(event.url);
        return false;
      }
      if (type === "request:shape") {
        const call = calls.get(String(event.requestId));
        const shape = shapeOf(event.shape);
        if (call && shape)
          observations.observe({
            ...call,
            place: call.place,
            shape,
            cut: event.cut === true,
            at: now(),
          });
        return true;
      }
      if (typeof type === "string" && ENDED.has(type))
        calls.delete(String(event.requestId ?? event.id));
      return false;
    },
  };
}

function callOf(
  event: Record<string, unknown>,
): { id: string; source: string; endpoint: string } | undefined {
  const { id, source, group, method } = event;
  if (typeof id !== "string" || typeof source !== "string" || typeof method !== "string")
    return undefined;
  return {
    id,
    source,
    endpoint: typeof group === "string" && group !== "" ? `${group}.${method}` : method,
  };
}

function remember<TValue>(calls: Map<string, TValue>, id: string, call: TValue): void {
  calls.set(id, call);
  if (calls.size <= MOST_OPEN_CALLS) return;
  const oldest = calls.keys().next().value;
  if (oldest !== undefined) calls.delete(oldest);
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).host || undefined;
  } catch {
    /* An address relative to a page names no host of its own. */
    return undefined;
  }
}

function shapeOf(value: unknown): Record<string, string> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  return Object.fromEntries(entries);
}
