import { redact } from "./redact";

/**
 * The words a failure is answered with when a server answers a call with
 * a `Response` of its own: the error's message without the credentials in
 * it — a header value the platform quoted as it refused it, a connection
 * string's password — as that `Response` may be handed on to a browser. A
 * bundler that builds for the browser takes a stand-in in place of this
 * module, and leaves the redaction rules out of the page.
 *
 * @param message - The error's message
 * @returns The message with its credentials cut
 * @example
 * ```ts
 * answeredMessage('Headers.set: "Bearer s3cr3t\r\nx" is an invalid header value.');
 * // → 'Headers.set: "[redacted]" is an invalid header value.'
 * ```
 */
export function answeredMessage(message: string): string {
  return redact(message);
}
