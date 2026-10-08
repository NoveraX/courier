import { eachEndpoint } from "@noverax/courier/internal";

const PREFIX = "header:";

/**
 * The headers an API's writes send their idempotency key in: the one most
 * APIs use, `Idempotency-Key`, and every one its endpoints name in their
 * `idempotencyKey` — so a mock of it deduplicates as the API does.
 *
 * @param source - The API, as `defineApi` returns it
 * @returns The header names, in lower case
 * @example
 * ```ts
 * keyHeadersOf(shop); // ["idempotency-key", "x-request-key"]
 * ```
 */
export function keyHeadersOf(source: object): string[] {
  const names = new Set(["idempotency-key"]);
  for (const endpoint of eachEndpoint(source)) {
    const declared = endpoint.options.idempotencyKey;
    if (typeof declared === "string" && declared.startsWith(PREFIX)) {
      names.add(declared.slice(PREFIX.length).trim().toLowerCase());
    }
  }
  return [...names];
}
