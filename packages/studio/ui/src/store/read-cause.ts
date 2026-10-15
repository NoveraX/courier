import { isPlainObject } from "@/socket/is-plain-object";
import type { RequestFailureCause } from "./types";

/* What the runtime sends: a system error code, and a text it has already cut to 300 characters. */
const CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
const MAX_MESSAGE_LENGTH = 300;

/**
 * Why a request got no answer, from an event or a saved session — kept only
 * when it is in the shape the runtime gives it: a text, and a code that
 * reads as a system error code.
 *
 * @param value - What the payload holds under `error.cause`
 * @returns The cause, or `undefined` for a failure that has none
 * @example
 * ```ts
 * readCause({ code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND api.test" });
 * // { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND api.test" }
 * ```
 */
export function readCause(value: unknown): RequestFailureCause | undefined {
  if (!isPlainObject(value) || typeof value.message !== "string" || value.message === "") {
    return undefined;
  }
  const message = value.message.slice(0, MAX_MESSAGE_LENGTH);
  const { code } = value;
  return typeof code === "string" && CODE_PATTERN.test(code) ? { code, message } : { message };
}
