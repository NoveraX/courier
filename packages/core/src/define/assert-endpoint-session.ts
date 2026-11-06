import { ConfigurationError } from "../errors/configuration-error";

/**
 * Check, where an endpoint is defined, how it takes its source's session and
 * forwarded headers.
 *
 * @param options - The endpoint's options
 * @throws ConfigurationError `SESSION_OPTIONS_INVALID` or `FORWARD_OPTIONS_INVALID`
 * @example
 * ```ts
 * assertEndpointSession({ session: "unguarded" });
 * ```
 */
export function assertEndpointSession(options: { session?: unknown; forward?: unknown }): void {
  const { session, forward } = options;
  if (session !== undefined && session !== false && session !== "unguarded") {
    throw new ConfigurationError(
      "SESSION_OPTIONS_INVALID",
      `an endpoint's session is false or "unguarded", not ${JSON.stringify(session)}`,
    );
  }
  if (forward !== undefined && forward !== false) {
    throw new ConfigurationError(
      "FORWARD_OPTIONS_INVALID",
      `an endpoint's forward is false, not ${JSON.stringify(forward)}`,
    );
  }
}
