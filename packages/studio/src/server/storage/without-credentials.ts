import { isCredentialHeader } from "@noverax/courier/internal";

import { isPlainObject } from "../is-plain-object";
/**
 * What Studio writes down holds no credentials.
 *
 * The request log, the mock logs, saved sessions and the Playground's
 * history are kept in `.courier/studio.db` in the project, where a backup,
 * a copy of the folder or another account on the machine can read them, and
 * a session is exported to be handed around. A header that carries a
 * credential — `Authorization`, a cookie, an API key — is kept by name with
 * its value replaced, the way a browser's sanitized HAR keeps it. The live
 * view, which nothing writes down, shows it whole to a page that presented
 * Studio's token alone (see `emitLiveEvents`).
 */

/** What a credential's value is replaced with. */
export const REDACTED = "[redacted]";

/** The fields of an event or a history entry that hold headers. */
const HEADER_FIELDS = ["headers", "requestHeaders", "responseHeaders"] as const;

/**
 * A set of headers with each credential's value replaced.
 *
 * @param headers - The headers, by name
 * @returns The same names, credentials redacted
 * @example
 * ```ts
 * headersWithoutCredentials({ authorization: "Bearer t", accept: "*\/*" });
 * // → { authorization: "[redacted]", accept: "*\/*" }
 * ```
 */
export function headersWithoutCredentials(
  headers: Readonly<Record<string, string>>,
): Record<string, string> {
  return redacted(headers, REDACTED);
}

/**
 * An event, or a Playground history entry, as it is written down: each of its
 * header fields without credentials, and everything else — the variables,
 * the answer — as it is.
 *
 * @param value - The event or entry
 * @returns A copy with its headers redacted, or the value itself when it has none
 * @example
 * ```ts
 * JSON.stringify(withoutCredentials(event));
 * ```
 */
export function withoutCredentials(value: unknown): unknown {
  if (!isPlainObject(value)) return value;
  const copy: Record<string, unknown> = { ...value };
  for (const field of HEADER_FIELDS) {
    const headers = value[field];
    if (typeof headers === "string") copy[field] = headerTextWithoutCredentials(headers);
    else if (isPlainObject(headers)) copy[field] = redacted<unknown>(headers, REDACTED);
  }
  return copy;
}

/*
 * The Playground's headers, as its editor holds them: JSON with line comments
 * and trailing commas. Text that does not read as an object could not have
 * been sent, and is kept as no headers at all rather than as it was typed.
 */
function headerTextWithoutCredentials(text: string): string {
  if (text.trim() === "") return text;
  try {
    const parsed: unknown = JSON.parse(
      text.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1"),
    );
    return isPlainObject(parsed)
      ? JSON.stringify(redacted<unknown>(parsed, REDACTED), null, 2)
      : "{}";
  } catch {
    /* Unreadable text is dropped, not written down: it may hold a credential. */
    return "{}";
  }
}

function redacted<TValue>(
  headers: Readonly<Record<string, TValue>>,
  replacement: TValue,
): Record<string, TValue> {
  const kept: Record<string, TValue> = {};
  for (const [name, value] of Object.entries(headers)) {
    kept[name] = isCredentialHeader(name) ? replacement : value;
  }
  return kept;
}
