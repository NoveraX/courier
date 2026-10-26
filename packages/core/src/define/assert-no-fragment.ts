import { ConfigurationError } from "../errors/configuration-error";

/**
 * Refuse a path an endpoint or a group declares when it writes a fragment.
 *
 * What follows `#` never reaches the server: a request sends its path up
 * to there, so the query a read's variables make — written after the
 * fragment — was dropped too, and a `#` inside the query was sent as part
 * of a value. A `#` the request should send is written `%23`.
 *
 * @param path - The path, as declared
 * @param where - What declares it, for the message
 * @throws ConfigurationError `PATH_FRAGMENT` when the path holds a `#`
 * @example
 * ```ts
 * assertNoFragment("items#top", '.get("items#top")'); // throws PATH_FRAGMENT
 * ```
 */
export function assertNoFragment(path: string, where: string): void {
  if (!path.includes("#")) return;
  throw new ConfigurationError(
    "PATH_FRAGMENT",
    `[courier] ${where} writes a fragment, which never reaches the server: a request sends its path up to the #, without a read's query either. Write %23 for a # the path sends.`,
  );
}
