/**
 * An address as `URL` reads it, or `undefined` where it is not one — what
 * `URL.parse` answers, on every runtime the core runs on. `URL.parse` and
 * `URL.canParse` are missing from Safari before 17, Chrome before 120,
 * Firefox before 115 and React Native without Expo, where calling them
 * throws instead of answering.
 *
 * @param input - The address
 * @param base - What a relative address is read against
 * @returns The URL, or `undefined` when the address does not parse
 * @example
 * ```ts
 * parseUrl("https://api.example.com/v1")?.origin; // "https://api.example.com"
 * parseUrl("/v1"); // undefined: a path, with no base to read it against
 * parseUrl("/v1", "https://app.example.com")?.href; // "https://app.example.com/v1"
 * ```
 */
export function parseUrl(input: string, base?: string | URL): URL | undefined {
  try {
    return new URL(input, base);
  } catch {
    /* The constructor's TypeError is the whole answer: not an address. */
    return undefined;
  }
}
