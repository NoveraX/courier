/**
 * An event of the request log or of a mock's, as a page without the
 * project's token is sent it: live, and kept by the logs beside the event
 * itself, cut once, the first time such a page is replayed the event as it
 * connects.
 */

import { cutText } from "@noverax/courier/internal";

import { isPlainObject } from "./is-plain-object";
import { bodyWithoutSecrets, headersWithoutSecrets } from "./session-file/scrub-secrets";
import { withoutCredentials } from "./storage/without-credentials";

/**
 * An event as a page without the token is sent it: credentials cut as
 * Studio writes them down, and the variables, the answer, the headers and a
 * stream message's preview as an export carries them.
 *
 * @param event - The event, whole
 * @returns A copy without its secrets, or the value itself when it is no record
 * @example
 * ```ts
 * eventWithoutSecrets({ type: "request:start", id: "r1", variables: { password: "p" } });
 * // { type: "request:start", id: "r1", variables: { password: "[redacted]" } }
 * ```
 */
export function eventWithoutSecrets(event: unknown): unknown {
  const kept = withoutCredentials(event);
  if (!isPlainObject(kept)) return kept;
  return {
    ...kept,
    ...(kept.variables !== undefined && { variables: bodyWithoutSecrets(kept.variables) }),
    ...(kept.data !== undefined && { data: bodyWithoutSecrets(kept.data) }),
    ...(typeof kept.dataPreview === "string" && { dataPreview: cutText(kept.dataPreview) }),
    ...headerFieldsWithoutSecrets(kept),
  };
}

/**
 * The text a log keeps beside an event's, for a page without the token:
 * empty where cutting changed nothing, so such an event is kept once.
 *
 * @param body - The event's JSON, as the log keeps it
 * @returns Its JSON without its secrets, or `""` when that is `body` itself
 * @example
 * ```ts
 * cut.run(keptWithoutSecrets(body), seq);
 * ```
 */
export function keptWithoutSecrets(body: string): string {
  const shown = JSON.stringify(eventWithoutSecrets(JSON.parse(body)));
  return shown === body ? "" : shown;
}

/* The fields of an event that hold headers, each value its name keeps read as a text. */
function headerFieldsWithoutSecrets(event: Record<string, unknown>): Record<string, unknown> {
  const cut: Record<string, unknown> = {};
  for (const field of ["headers", "requestHeaders", "responseHeaders"]) {
    const headers = event[field];
    if (isPlainObject(headers)) {
      cut[field] = headersWithoutSecrets(headers as Record<string, string>);
    }
  }
  return cut;
}
