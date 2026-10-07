import { createLogger } from "../logger";

const log = createLogger("Proxy");

/*
 * The schemes a browser answers a site's own 401 challenge with, and then
 * sends by itself with every request to that site: credentials of the
 * application's site, never set by a script for the API it calls.
 */
const BROWSER_SCHEMES: ReadonlySet<string> = new Set(["basic", "digest", "negotiate", "ntlm"]);

const warned = new Set<string>();

/**
 * Keep the browser's own credentials from an API: drop an `Authorization`
 * the incoming request carries in a scheme a browser sends by itself —
 * `Basic`, `Digest`, `Negotiate`, `NTLM`, the answer to the application's
 * own login prompt — unless the API or the endpoint names `authorization`.
 * A `Bearer` token, or any scheme a script sets, goes on as before.
 *
 * @param headers - The headers taken from the incoming request, before the call's own
 * @param named - The header names the API and the endpoint carry across
 * @param source - The API's name, for the log
 * @example
 * ```ts
 * keepBrowserCredentials(newHeaders, allowedHeaders, "api");
 * ```
 */
export function keepBrowserCredentials(
  headers: Headers,
  named: readonly string[] | undefined,
  source: string,
): void {
  if (named?.some((name) => name.toLowerCase() === "authorization")) return;
  const scheme = headers.get("authorization")?.trim().split(/\s+/, 1)[0]?.toLowerCase();
  if (scheme === undefined || !BROWSER_SCHEMES.has(scheme)) return;
  headers.delete("authorization");
  const key = `${source} ${scheme}`;
  if (warned.has(key)) return;
  warned.add(key);
  log.warn(
    `The request's ${scheme} Authorization was not passed on to "${source}": a browser sends it by itself to the site that asked for it, and it is your application's, not the API's. Name "authorization" in the API's allowedHeaders, or in the endpoint's .headers(), to pass it on.`,
  );
}
