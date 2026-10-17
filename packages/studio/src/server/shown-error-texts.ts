import { shownCause, shownText } from "@noverax/courier/internal";

import { isPlainObject } from "./is-plain-object";

/* The field of each event that holds an error's text as a string. */
const TEXT_FIELDS: Readonly<Record<string, string>> = {
  "http:fetch:error": "message",
  "middleware:error": "error",
  "stream:error": "error",
};

/**
 * An event a runtime sent, with its error's text cut as every error text
 * Studio is told is — a request's failure, its cause, a fetch's, a
 * middleware's and a stream's. A runtime cuts them itself; one made before
 * it did is cut here, before the log keeps the event, the UI shows it or
 * an agent reads it.
 *
 * @param event - The event as the runtime sent it
 * @returns The event, its error texts cut; the event itself when it has none
 * @example
 * ```ts
 * withShownErrorTexts({ type: "stream:error", requestId: "r1", error: "closed Bearer B34rer" });
 * // → { type: "stream:error", requestId: "r1", error: "closed Bearer [redacted]" }
 * ```
 */
export function withShownErrorTexts(event: Record<string, unknown>): Record<string, unknown> {
  if (event.type === "request:error") return withShownFailure(event);
  const field = typeof event.type === "string" ? TEXT_FIELDS[event.type] : undefined;
  const text = field === undefined ? undefined : event[field];
  return field !== undefined && typeof text === "string"
    ? { ...event, [field]: shownText(text) }
    : event;
}

function withShownFailure(event: Record<string, unknown>): Record<string, unknown> {
  const { error } = event;
  if (!isPlainObject(error)) return event;
  const { cause, ...rest } = error;
  const shown = cause === undefined ? undefined : shownCause(cause);
  return {
    ...event,
    error: {
      ...rest,
      ...(typeof rest.message === "string" && { message: shownText(rest.message) }),
      ...(shown && { cause: shown }),
    },
  };
}
