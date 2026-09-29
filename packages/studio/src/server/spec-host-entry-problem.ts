/* What an entry may hold: a host, or a host and a port. A scheme, a path,
   a user, a query or a space make it one no URL's host ever equals. */
const NOT_A_HOST = /[/?#@\s]/;

/**
 * What is wrong with an entry of `studio.allowedSpecHosts`, if anything.
 *
 * An entry is compared with the host, or the host and port, of each URL
 * Studio would fetch a specification from. An entry written as a URL, or
 * with a path or a trailing dot, is never equal to one, and allowed nothing
 * while it looked as if it did.
 *
 * @param entry - The entry, as the config gives it
 * @returns What is wrong with it, to follow `allowedSpecHosts[i] `, or `null`
 * @example
 * ```ts
 * specHostEntryProblem("https://gitlab.internal"); // → 'is "https://gitlab.internal": name the host alone, as "gitlab.internal"'
 * specHostEntryProblem("10.0.0.7:8080"); // → null
 * ```
 */
export function specHostEntryProblem(entry: unknown): string | null {
  if (typeof entry !== "string") return `is ${entry === null ? "null" : typeof entry}, not a host`;
  const host = entry.trim();
  if (host === "") return "is empty";
  const scheme = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(host);
  if (scheme) return `is "${entry}": name the host alone, as "${scheme[1] ?? ""}"`;
  if (NOT_A_HOST.test(host))
    return `is "${entry}": an entry holds a host, or a host and a port, alone`;
  if (/\.(:\d+)?$/.test(host)) return `is "${entry}": leave out the trailing dot`;
  return null;
}
