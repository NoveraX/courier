import { ConfigurationError } from "../errors";

const WEB_SCHEMES = new Set(["http:", "https:"]);

/**
 * Refuse, when a handler is created, an `allowedOrigins` entry that no page's
 * `Origin` can ever equal. Such an entry would match nothing: the page it is
 * written for would be refused, and nothing would say why.
 *
 * An entry is an origin as a browser sends it — `https://app.example.com`,
 * no path and no trailing slash, the scheme's default port left out — or a
 * sub-domain pattern, `https://*.example.com` or `*.example.com`. `null` is
 * refused as well: it is what every sandboxed frame and `data:` page sends,
 * whatever site it belongs to.
 *
 * @param allowedOrigins - The entries the handler was given
 * @param where - The factory being configured, named in the error
 * @throws ConfigurationError `INVALID_ALLOWED_ORIGIN` naming the entry and the form it needs
 *
 * @example
 * ```ts
 * assertAllowedOrigins(["https://app.example.com/"], "createHandler");
 * // throws: … can never match: a browser sends this origin as "https://app.example.com"
 * ```
 */
export function assertAllowedOrigins(
  allowedOrigins: readonly string[] | undefined,
  where: string,
): void {
  for (const entry of allowedOrigins ?? []) {
    const problem = entryProblem(entry);
    if (problem !== undefined) {
      throw new ConfigurationError(
        "INVALID_ALLOWED_ORIGIN",
        `${where}: the allowedOrigins entry "${entry}" ${problem}`,
      );
    }
  }
}

/* What is wrong with an entry, or nothing when a page can send it. */
function entryProblem(entry: string): string | undefined {
  if (entry === "null") {
    return "admits every sandboxed frame and data: page, whatever its site; list the page's own origin";
  }
  if (entry.startsWith("*.")) return hostPatternProblem(entry.slice(2));
  const origin = entry.replace("://*.", "://");
  if (!entry.includes("://") || !URL.canParse(origin)) {
    return 'is not an origin; write one as scheme://host[:port], such as "https://app.example.com"';
  }
  const url = new URL(origin);
  if (!WEB_SCHEMES.has(url.protocol)) {
    return url.pathname === "" && url.search === "" && url.hash === ""
      ? undefined
      : "has a path; an origin ends after its host";
  }
  if (entry === origin) {
    return url.origin === entry.toLowerCase()
      ? undefined
      : `can never match: a browser sends this origin as "${url.origin}"`;
  }
  const pattern = url.origin.replace("://", "://*.");
  return pattern === entry.toLowerCase()
    ? undefined
    : `is not written as an origin; write it as "${pattern}"`;
}

/* A `*.host` pattern names a host, and the port it is served on at most. */
function hostPatternProblem(host: string): string | undefined {
  const valid = host !== "" && URL.canParse(`https://${host}`);
  if (valid && new URL(`https://${host}`).host === host.toLowerCase()) return undefined;
  return 'is not a sub-domain pattern; write one as "*.example.com" or "https://*.example.com"';
}
