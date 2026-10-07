import { eachGroup } from "../define/group-tree";
import { ConfigurationError } from "../errors/configuration-error";
import type { BaseOptions } from "../http-client/types";
import { isEndpointEntry } from "../utils/execute-helpers";
import { assertForwardOptions, assertNoCookieHeaders } from "./validate-forward";
import { assertSessionOptions } from "./validate-session";

/**
 * Check, where an API is defined, its `session` and `forward`, and that no
 * header list of the API or of its endpoints carries cookies past the
 * session.
 *
 * @param api - The API, its groups and endpoints in place
 * @param options - The options it was defined with
 * @param where - Its name, for the errors
 * @throws ConfigurationError when either cannot work as written
 * @example
 * ```ts
 * assertSessionApi(api, api.options, "api");
 * ```
 */
export function assertSessionApi(api: object, options: BaseOptions, where: string): void {
  assertSessionOptions(options.session, options.baseURL, where);
  assertForwardOptions(options.forward, where);
  if (options.session === undefined) return;
  assertNoCookieHeaders(options.allowedHeaders, where);
  for (const [path, allowedHeaders] of endpointHeaderLists(api)) {
    assertNoCookieHeaders(allowedHeaders, `${where}.${path}`);
  }
}

/* The header list of every endpoint, by its path from the API. */
function* endpointHeaderLists(api: object): Generator<[string, readonly string[] | undefined]> {
  const holders: Array<[string, object]> = [["", api]];
  for (const { path, group } of eachGroup(api)) holders.push([`${path}.`, group]);
  for (const [prefix, holder] of holders) {
    for (const name of Object.keys(holder)) {
      const endpoint: unknown = Reflect.get(holder, name);
      if (name === "options" || !isEndpointEntry(endpoint)) continue;
      yield [`${prefix}${name}`, allowedHeadersOf(endpoint)];
    }
  }
}

function allowedHeadersOf(endpoint: object): readonly string[] | undefined {
  const options: unknown = Reflect.get(endpoint, "options");
  if (typeof options !== "object" || options === null) return undefined;
  const headers: unknown = Reflect.get(options, "allowedHeaders");
  return isStringList(headers) ? headers : undefined;
}

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry: unknown) => typeof entry === "string");
}

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
