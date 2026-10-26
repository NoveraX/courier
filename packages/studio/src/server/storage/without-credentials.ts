import { isCredentialHeader } from "@noverax/courier/internal";
import { REDACTED, urlWithoutSecrets } from "@noverax/courier-studio-core";

import { isPlainObject } from "../is-plain-object";
import { withoutSecretTexts } from "../secrets/without-secret-texts";

/**
 * What leaves the page that holds Studio's token holds no credentials.
 *
 * The request log, the mock logs, saved sessions and the Playground's
 * history are kept in `.courier/studio.db` in the project, where a backup,
 * a copy of the folder or another account on the machine can read them; a
 * session is exported to be handed around; an agent's answer goes on to
 * its model's provider; and a page without the token, or an editor, reads
 * what anyone on the machine may. A header that carries a credential —
 * `Authorization`, a cookie, an API key — is kept by name with its value
 * replaced, the way a browser's sanitized HAR keeps it; an address is kept
 * without its password or its secret parameters, in a header's `Location`
 * too; and an error's text, and why a request got no answer, are kept with
 * what could be a credential cut out. The live view, which nothing writes
 * down, shows all of it whole to a page that presented Studio's token
 * alone (see `emitLiveEvents`).
 */

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
 * An event, a Playground history entry or one of its chunks, as it leaves
 * the token page: each of its header fields without credentials, its
 * address, its error's text and its cause cut, and everything else — the
 * variables, the answer — as it is.
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
  const copy = withoutSecretTexts(value);
  for (const field of HEADER_FIELDS) {
    const headers = value[field];
    if (typeof headers === "string") copy[field] = headerTextWithoutCredentials(headers);
    else if (isPlainObject(headers)) copy[field] = redacted<unknown>(headers, REDACTED);
  }
  if (Array.isArray(copy.chunks)) copy.chunks = copy.chunks.map(withoutCredentials);
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

/* A redirect's `Location` is an address, and a password or a token in it is cut as in any other. */
function redacted<TValue>(
  headers: Readonly<Record<string, TValue>>,
  replacement: TValue,
): Record<string, TValue | string> {
  const kept: Record<string, TValue | string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (isCredentialHeader(name)) kept[name] = replacement;
    else if (name.toLowerCase() === "location" && typeof value === "string") {
      kept[name] = urlWithoutSecrets(value);
    } else kept[name] = value;
  }
  return kept;
}
