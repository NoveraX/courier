import { CourierError } from "@noverax/courier";
import { errnoCode } from "./errno-code";
import { messageOf } from "./message-of";

/** Why Studio did not fetch a specification from a URL. */
export type SpecFetchErrorCode =
  | "SPEC_URL_INVALID"
  | "SPEC_HOST_PRIVATE"
  | "SPEC_REDIRECTS"
  | "SPEC_REDIRECT_INVALID"
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
   * The failure for a connection that closed once the server had begun to
   * answer: the host was reached, and the body it was sending is incomplete.
   *
   * @param url - The URL whose answer was cut off
   * @param cause - What the connection or the response failed with
   * @returns The error
   *
   * @example
   * ```ts
   * response.on("error", (error) => reject(SpecFetchError.cutOff(url, error)));
   * ```
   */
  static cutOff(url: URL, cause: unknown): SpecFetchError {
    return new SpecFetchError(
      "SPEC_UNREACHABLE",
      `${url.href} closed the connection before the whole specification arrived (${errnoCode(cause) ?? messageOf(cause)}).`,
      { cause, url: url.href },
    );
  }

  /**
   * The refusal for a private address the project did not name.
   *
   * @param what - The host, and the address it resolved to when there was a lookup
   * @param missingConfigIn - The project root, when it has no courier.config to name the host in
   * @returns The error
   */
  static privateHost(what: string, missingConfigIn?: string): SpecFetchError {
    const advice = missingConfigIn
      ? `There is no courier.config in ${missingConfigIn}; create it and name the host in \`studio.allowedSpecHosts\` to allow it.`
      : "Name the host in `studio.allowedSpecHosts` to allow it.";
    return new SpecFetchError(
      "SPEC_HOST_PRIVATE",
      `Blocked request to private address: ${what}. Studio reads a specification on your behalf, so it does not reach into a private network — or back to this machine once a redirect has left it — by itself. ${advice}`,
    );
  }

  /**
   * The refusal, for a visitor of a public demo, of any address but a public
   * one: this machine runs the demo's own services, and its network is the host's.
   *
   * @param what - The host, and the address it resolved to when there was a lookup
   * @returns The error
   */
  static publicOnly(what: string): SpecFetchError {
    return new SpecFetchError(
      "SPEC_HOST_PRIVATE",
      `Blocked request to ${what}: in this demo, Studio reads a specification for a visitor from the public internet only. Paste the specification, or give a public URL.`,
    );
  }

  /**
   * The refusal for an address that means every interface: no host to
   * fetch from, yet connecting to it reaches this machine's own services, so
   * no entry in `studio.allowedSpecHosts` allows it.
   *
   * @param what - The host, and the address it resolved to when there was a lookup
   * @returns The error
   */
  static unspecifiedHost(what: string): SpecFetchError {
    return new SpecFetchError(
      "SPEC_URL_INVALID",
      `Blocked request to unspecified address: ${what}. It names no host, and Studio does not fetch from one even when \`studio.allowedSpecHosts\` lists it.`,
    );
  }
}
