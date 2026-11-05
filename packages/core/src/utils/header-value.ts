import { ConfigurationError } from "../errors/configuration-error";

/* Left once the ends are trimmed, as fetch trims them: what it refuses, repeating the value whole. */
const UNSENDABLE = /[\0\n\r]/;

/**
 * Refuse a header value `fetch` could not send — a NUL, or a line break
 * inside it rather than at an end — before the platform does: its refusal
 * repeats the value whole, and a header's value is often a credential. The
 * error names the header and never the value. What `fetch` sends passes,
 * a line break at an end too, which it trims.
 *
 * @param name - The header's name
 * @param value - Its value
 * @param said - What the value is, for the message (default: the header's value)
 * @throws {ConfigurationError} `HEADER_VALUE_INVALID`, when the value cannot be sent
 * @example
 * ```ts
 * assertHeaderValue("authorization", `Bearer ${token}`, "The token getToken returned");
 * ```
 */
export function assertHeaderValue(name: string, value: string, said?: string): void {
  if (!UNSENDABLE.test(value.trim())) return;
  throw new ConfigurationError(
    "HEADER_VALUE_INVALID",
    `${said ?? `The "${name}" header's value`} holds a NUL or a line break, which no header carries; the value is not shown.`,
  );
}
