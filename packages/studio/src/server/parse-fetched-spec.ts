import { type ParsedSpec, parseSpec } from "../apis";
import { SpecUnreadableError } from "./spec-unreadable-error";

/**
 * Parse the specification a URL answered with. An answer that is not one
 * is the host's failure, not Studio's: it is reported as such, with the
 * reason, instead of as an error of Studio's own.
 *
 * @param url - The URL that answered
 * @param raw - Its answer's text
 * @returns The specification
 * @throws {SpecUnreadableError} When the answer is not a specification Studio reads
 * @example
 * ```ts
 * const spec = parseFetchedSpec(entry.from, await fetchSpec(entry.from, allowlist));
 * ```
 */
export function parseFetchedSpec(url: string, raw: string): ParsedSpec {
  try {
    return parseSpec(raw);
  } catch (error) {
    throw new SpecUnreadableError(url, error);
  }
}
