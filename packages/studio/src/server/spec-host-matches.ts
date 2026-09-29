import { domainToASCII } from "node:url";

const DEFAULT_PORTS: ReadonlyMap<string, string> = new Map([
  ["http:", "80"],
  ["https:", "443"],
]);

// biome-ignore lint/suspicious/noControlCharactersInRegex: the range is every character outside ASCII
const NON_ASCII = /[^\x00-\x7f]/;

/**
 * Whether an entry of `studio.allowedSpecHosts` names a URL's host.
 *
 * An entry names the host with or without its port, in any case, an IPv6
 * address with or without brackets, a name in other letters than ASCII as
 * it is written. A URL that names no port has its scheme's default, which
 * URL leaves out of `host`.
 *
 * @param entry - The entry: a host, or a host and a port
 * @param url - The URL Studio would fetch from
 * @returns Whether the entry allows it
 * @example
 * ```ts
 * specHostMatches("gitlab.internal", new URL("https://gitlab.internal:8443/spec.json")); // → true
 * specHostMatches("bücher.example", new URL("http://xn--bcher-kva.example/")); // → true
 * ```
 */
export function specHostMatches(entry: string, url: URL): boolean {
  const wanted = asciiHost(entry.trim().toLowerCase());
  const unbracketed = url.hostname.replace(/^\[|\]$/g, "");
  const port = url.port || DEFAULT_PORTS.get(url.protocol);
  return (
    [`${url.hostname}:${port}`, url.hostname, unbracketed].includes(wanted) ||
    wanted.replace(/^\[|\]$/g, "") === unbracketed
  );
}

/* A URL's host is in its ASCII form, so a name written in other letters is
   compared in that form too. Such a name is no IPv6 address, so its last
   colon, if any, comes before its port. */
function asciiHost(entry: string): string {
  if (!NON_ASCII.test(entry)) return entry;
  const colon = entry.lastIndexOf(":");
  const host = colon === -1 ? entry : entry.slice(0, colon);
  const port = colon === -1 ? "" : entry.slice(colon);
  return (domainToASCII(host) || host) + port;
}
