import type { ParsedSpec } from "../apis";
import { MAX_MESSAGE_BYTES } from "./max-message-bytes";
import { SpecTooLargeError } from "./spec-too-large-error";

/**
 * Refuse a parsed specification Studio could not take back in a request:
 * one Studio hands the UI must be one the UI can send again to write it.
 *
 * @param spec - The parsed specification
 * @throws {SpecTooLargeError} When it is larger, as JSON, than a request body may be
 * @example
 * ```ts
 * const spec = parseSpec(raw);
 * refuseUnsendable(spec);
 * res.json(spec);
 * ```
 */
export function refuseUnsendable(spec: ParsedSpec): void {
  const bytes = Buffer.byteLength(JSON.stringify(spec));
  if (bytes > MAX_MESSAGE_BYTES) throw new SpecTooLargeError(bytes);
}
