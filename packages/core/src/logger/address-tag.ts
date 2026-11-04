import { randomId } from "../utils/random-id";

/* Drawn once a process, and never printed: without it the tag of an IPv4
   address could be found by trying all four billion of them. */
let salt: string | undefined;

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * The name a log line gives a client's address: eight hex digits, the same
 * for one address all through the process, so its refusals can be told
 * apart from another's and counted, while the address itself stays out of
 * the log. The digits are a hash of the address under a secret the process
 * draws once; a tag says nothing on another replica or after a restart.
 *
 * @param address - The client's address, as the handler counts it
 * @returns The tag, such as `"9c1b2e4a"`
 * @example
 * ```ts
 * refusals.warn({ event: "connection refused", code: 4401, fields: { addr: addressTag(ip) } });
 * ```
 */
export function addressTag(address: string): string {
  salt ??= randomId();
  const text = `${salt}|${address}`;
  let hash = FNV_OFFSET;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
