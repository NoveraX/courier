import { cutText, type RequestFailureCause, readCause } from "@noverax/courier-studio-core";

/**
 * Why a request got no answer, as it leaves Studio's token page: its code
 * as the runtime gave it, and its text with what could be a credential cut
 * out, as an error's text is.
 *
 * @param value - What is held under `error.cause`, of any shape
 * @returns The cause, or `undefined` when it has no text
 * @example
 * ```ts
 * cutCause({ code: "ECONNREFUSED", message: "connect https://u:p@api.test/x?token=t" });
 * // → { code: "ECONNREFUSED", message: "connect https://api.test/x?token=[redacted]" }
 * ```
 */
export function cutCause(value: unknown): RequestFailureCause | undefined {
  const cause = readCause(value);
  if (cause === undefined) return undefined;
  const message = cutText(cause.message, 300);
  if (message === "") return undefined;
  return cause.code === undefined ? { message } : { code: cause.code, message };
}
