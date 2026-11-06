import { parseUrl, urlWithoutSecrets } from "@noverax/courier/internal";

/**
 * A URL as a message or a log line names it: its `href` — no line break,
 * tab or space left inside, which a reading word by word would stop at —
 * with no user, no password and no secret parameter.
 *
 * @param url - The URL, as the parser read it
 * @returns The URL to name
 * @example
 * ```ts
 * namedUrl(new URL("https://ana:pw@api.test/openapi.json?api_key=k3y"));
 * // → "https://api.test/openapi.json?api_key=[redacted]"
 * ```
 */
export function namedUrl(url: URL): string {
  const read = new URL(url.href);
  read.username = "";
  read.password = "";
  return urlWithoutSecrets(read.href);
}

/**
 * An address as a message or a log line names it: as the URL parser reads
 * it, by {@link namedUrl}; an address the parser cannot read is not named
 * at all, as nothing tells where its secrets are.
 *
 * @param address - The address, as given
 * @returns The address to name, or `undefined` for one that is no URL
 * @example
 * ```ts
 * namedAddress("https://ana:pa\nss@api.test/openapi.json"); // → "https://api.test/openapi.json"
 * ```
 */
export function namedAddress(address: string): string | undefined {
  const read = parseUrl(address.trim());
  return read === undefined ? undefined : namedUrl(read);
}
