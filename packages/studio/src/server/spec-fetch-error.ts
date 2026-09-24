import { CourierError } from "@noverax/courier";

/** Why Studio did not fetch a specification from a URL. */
export type SpecFetchErrorCode =
  | "SPEC_URL_INVALID"
  | "SPEC_HOST_PRIVATE"
  | "SPEC_REDIRECTS"
  | "SPEC_HTTP_STATUS"
  | "SPEC_TOO_LARGE"
  | "SPEC_TIMEOUT"
  | "SPEC_UNREACHABLE";

/* Codes for a URL Studio refused to fetch, rather than one it failed to. */
const REFUSALS: ReadonlySet<SpecFetchErrorCode> = new Set([
  "SPEC_URL_INVALID",
  "SPEC_HOST_PRIVATE",
]);

/**
 * Studio did not fetch a specification from a URL, and says why.
 *
 * @example
 * ```ts
 * if (err instanceof SpecFetchError) res.status(err.refused ? 400 : 502).json({ error: err.message });
 * ```
 */
export class SpecFetchError extends CourierError<SpecFetchErrorCode> {
  constructor(
    code: SpecFetchErrorCode,
    message: string,
    options: { cause?: unknown; url?: string } = {},
  ) {
    super(message, {
      code,
      cause: options.cause,
      context: options.url ? { url: options.url } : undefined,
    });
  }

  /** Whether Studio refused the URL itself — the request's fault — rather than failing to fetch it. */
  get refused(): boolean {
    return REFUSALS.has(this.code);
  }

  /**
   * The refusal for a private address the project did not name.
   *
   * @param what - The host, and the address it resolved to when there was a lookup
   * @returns The error
   */
  static privateHost(what: string): SpecFetchError {
    return new SpecFetchError(
      "SPEC_HOST_PRIVATE",
      `Blocked request to private address: ${what}. Studio reads a specification on your behalf, so it does not reach into a private network by itself. Name the host in \`studio.allowedSpecHosts\` to allow it.`,
    );
  }
}
