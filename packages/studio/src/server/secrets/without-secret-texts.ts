import { cutText, urlWithoutSecrets } from "@noverax/courier-studio-core";

import { isPlainObject } from "../is-plain-object";
import { cutCause } from "./cut-cause";

/* The field of each event that holds an error's text as a string. */
const TEXT_FIELDS: ReadonlyMap<string, string> = new Map([
  ["http:fetch:error", "message"],
  ["middleware:error", "error"],
  ["stream:error", "error"],
  ["mock:request:error", "message"],
]);

/**
 * An event, a Playground history entry or one of its chunks, with the
 * texts that could hold a credential cut as they leave the token page: an
 * address under `url`, an error's text and its cause, why a stream's last
 * connection ended, the text a failed Playground call ended with, and a
 * Playground result's error and the body Courier gives a request that got
 * no answer. Everything else — the headers, the variables, the answer — is
 * as it was.
 *
 * @param value - The event, entry or chunk
 * @returns A copy, its texts cut
 * @example
 * ```ts
 * withoutSecretTexts({ type: "http:fetch:error", requestId: "r1", message: "token=s3cret refused" });
 * // → { type: "http:fetch:error", requestId: "r1", message: "token=[redacted] refused" }
 * ```
 */
export function withoutSecretTexts(
  value: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...value };
  if (typeof copy.url === "string") copy.url = urlWithoutSecrets(copy.url);
  const field = typeof copy.type === "string" ? TEXT_FIELDS.get(copy.type) : undefined;
  const text = field === undefined ? undefined : copy[field];
  if (field !== undefined && typeof text === "string") copy[field] = cutText(text);
  if (isPlainObject(copy.error)) copy.error = errorWithoutSecrets(copy.error);
  /* Why a stream's last connection ended, on how its connection stands. */
  if (copy.cause !== undefined) {
    const cause = cutCause(copy.cause);
    if (cause) copy.cause = cause;
    else delete copy.cause;
  }
  /* A Playground call that failed ends with its error's text in place of an answer. */
  if (copy.status === "error" && typeof copy.response === "string") {
    copy.response = cutText(copy.response);
  }
  if (copy.kind === "http-result") return resultWithoutSecrets(copy);
  return copy;
}

/* A request's failure: its text, and why no answer came. */
function errorWithoutSecrets(error: Record<string, unknown>): Record<string, unknown> {
  const { cause, ...rest } = error;
  const cut = cause === undefined ? undefined : cutCause(cause);
  return {
    ...rest,
    ...(typeof rest.message === "string" && { message: cutText(rest.message) }),
    ...(cut && { cause: cut }),
  };
}

/* A Playground result: its error's text, and the body of a request that got no answer, which says why. */
function resultWithoutSecrets(result: Record<string, unknown>): Record<string, unknown> {
  if (typeof result.error === "string") result.error = cutText(result.error);
  /* Courier's own body for it is a cause and no more: anything else it held is left behind. */
  if (result.status === 0) {
    const cause = cutCause(result.data);
    result.data = cause && { success: false, ...cause };
  }
  return result;
}
