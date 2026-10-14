import { ConfigurationError } from "../errors/configuration-error";

/**
 * Refuse, where the API is defined, a session beside a header list that
 * carries cookies wholesale: `"cookie"` would send every cookie of the
 * application, and `"set-cookie"` pass every cookie the API sets onto the
 * application's origin, unmade — the very things the session limits.
 *
 * @param allowedHeaders - A header list of the API, a base or an endpoint
 * @param where - What the list belongs to, named in the error
 * @throws ConfigurationError `SESSION_HEADER_CONFLICT`
 * @example
 * ```ts
 * assertNoCookieHeaders(["x-total-count"], "api"); // passes
 * ```
 */
export function assertNoCookieHeaders(
  allowedHeaders: readonly string[] | undefined,
  where: string,
): void {
  const name = allowedHeaders?.find((header) => /^(set-)?cookie$/i.test(header));
  if (name === undefined) return;
  throw new ConfigurationError(
    "SESSION_HEADER_CONFLICT",
    `${where}: "${name}" in its headers carries cookies wholesale beside the session, which sends and keeps only the cookies it names; leave "${name}" out`,
  );
}
