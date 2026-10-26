import { sliceWhole } from "../lib/slice-whole";
import type { RequestFailureCause } from "./request";

/* A system error code: `ECONNREFUSED`, `UND_ERR_SOCKET`, or Bun's `ConnectionRefused`. */
const CODE_PATTERN = /^[A-Z][A-Za-z0-9_]{1,63}$/;
const MAX_MESSAGE_LENGTH = 300;

/**
 * Why a request got no answer, in the shape the runtime gives it, wherever
 * it comes from — a runtime's event, a page, a saved session: a text, cut
 * to 300 characters with no half of a character left at the cut, and a
 * code only where it reads as a system error code. Anything else is no
 * cause.
 *
 * @param value - What is held under `error.cause`
 * @returns The cause, or `undefined` for a failure that has none
 * @example
 * ```ts
 * readCause({ code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND api.test" });
 * // → { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND api.test" }
 * readCause({ code: "ConnectionRefused", message: "Unable to connect" }); // Bun's code is kept
 * ```
 */
export function readCause(value: unknown): RequestFailureCause | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const message: unknown = Reflect.get(value, "message");
  if (typeof message !== "string" || message === "") return undefined;
  const code: unknown = Reflect.get(value, "code");
  const text = sliceWhole(message, MAX_MESSAGE_LENGTH);
  return typeof code === "string" && CODE_PATTERN.test(code)
    ? { code, message: text }
    : { message: text };
}
