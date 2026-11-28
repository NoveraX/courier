import { assertTransportOptions } from "../http-client/assert-transport-options";
import type { BaseOptions } from "../http-client/types";
import { ownFields } from "../utils/own";
import { announceSource } from "./announce-source";
import { assertCancelPrevious } from "./assert-cancel-previous";
import { assertNoReservedGroupName, assertNoReservedName } from "./assert-no-reserved-name";
import type { ExposeMark } from "./marker";
import { SOURCE_NAME_KEY } from "./source-name-key";
import type {
  DefinedApi,
  DefinedFlatApi,
  DefinedMixedApi,
  EndpointRecord,
  ExposeKept,
  ExposeWritten,
  FromArguments,
  GroupRecord,
  NoEndpoints,
  NoGroups,
  OwnEndpoints,
  OwnGroups,
} from "./types";

/**
 * Derive a human-readable name from baseURL hostname.
 *
 * Exported because a caller that needs to know whether a source's name was
 * chosen by its author has to ask this function rather than reimplement it —
 * a second copy disagreed on relative URLs and rejected configurations nobody
 * had named at all.
 */
export function deriveSourceName(baseURL?: string): string {
  if (!baseURL) return "api";
  try {
    const host = new URL(baseURL).hostname.split(".")[0] || "api";
    // Convert hyphenated hostname to camelCase: "json-placeholder" → "jsonPlaceholder"
    return host.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  } catch {
    return "api";
  }
}

/**
 * Define an API source with groups of typed endpoints.
 *
 * @param config - The source's options, with its `groups`, its flat `endpoints`, or both
 * @returns The source: its endpoints, with its options beside them under `options`
 * A `session` and a `forward`, which only a server reads, are checked where
 * a server takes the API up — its sources registered, a handler made, the
 * server's caller made — so a page that imports the definition carries none
 * of those checks.
 *
 * @throws ConfigurationError `RESERVED_ENDPOINT_NAME` for a flat endpoint
 *   named `options`, `raw` or `with`, or a group named `raw` or `with`;
 *   `CANCEL_PREVIOUS_INVALID` for a `cancelPrevious` that is neither `true`
 *   nor `false`
 *
 * @example
 * const { endpoint } = courier()
 *
 * // With groups:
 * const source = defineApi({
 *   baseURL: "https://api.example.com",
 *   groups: { users: usersGroup, posts: postsGroup },
 * })
 *
 * // Flat (no groups):
 * const source = defineApi({
 *   baseURL: "https://api.example.com",
 *   endpoints: {
 *     getUsers: endpoint.get("users").response(UserListSchema),
 *   },
 * })
 *
 * // Mixed (groups + flat endpoints):
 * const source = defineApi({
 *   baseURL: "https://api.example.com",
 *   groups: { users: usersGroup },
 *   endpoints: {
 *     healthCheck: endpoint.get("health"),
 *   },
 * })
 *
 * // With proxyPath (where the app serves its proxy routes, which Studio's
 * // Playground sends a call through; a page's client is given its own):
 * const source = defineApi({
 *   baseURL: "https://api.example.com",
 *   proxyPath: {
 *     http: "/api/request",
 *     sse: "/api/sse",
 *     // Required for WS endpoints. On Next.js / Cloudflare / Vercel Edge,
 *     // run @noverax/courier-server separately and point this at it.
 *     ws: "wss://realtime.example.com",
 *   },
 *   groups: { chat: chatGroup },
 * })
 */
export function defineApi<
  TGroups extends OwnGroups,
  TEndpoints extends OwnEndpoints,
  const TExpose extends ExposeMark = undefined,
>(
  config: BaseOptions & {
    /**
     * The identifier the proxy addresses this source by — `?_s=<name>`.
     *
     * It must equal the key this source has in the `sources` map, which is
     * the name the registry resolves a page's call by and the routes module
     * names the source by. Omitted, it is derived from the `baseURL`
     * hostname. It is not a display string: a label with spaces in it
     * produces a source nothing can reach.
     */
    name?: string | undefined;
    /** Map of named endpoint groups created with defineGroup() */
    groups: TGroups;
    /** Map of flat endpoint functions (not in any group) */
    endpoints: TEndpoints;
  } & ExposeWritten<TExpose>,
): DefinedMixedApi<TGroups, TEndpoints, FromArguments<ExposeKept<TExpose>>>;

export function defineApi<TGroups extends OwnGroups, const TExpose extends ExposeMark = undefined>(
  config: BaseOptions & {
    /**
     * The identifier the proxy addresses this source by — `?_s=<name>`.
     *
     * It must equal the key this source has in the `sources` map, which is
     * the name the registry resolves a page's call by and the routes module
     * names the source by. Omitted, it is derived from the `baseURL`
     * hostname. It is not a display string: a label with spaces in it
     * produces a source nothing can reach.
     */
    name?: string | undefined;
    /** Map of named endpoint groups created with defineGroup() */
    groups: TGroups;
    /** None here: a source with endpoints beside its groups is the overload above. */
    endpoints?: NoEndpoints | undefined;
  } & ExposeWritten<TExpose>,
): DefinedApi<TGroups, FromArguments<ExposeKept<TExpose>>>;

export function defineApi<
  TEndpoints extends OwnEndpoints,
  const TExpose extends ExposeMark = undefined,
>(
  config: BaseOptions & {
    /**
     * The identifier the proxy addresses this source by — `?_s=<name>`.
     *
     * It must equal the key this source has in the `sources` map, which is
     * the name the registry resolves a page's call by and the routes module
     * names the source by. Omitted, it is derived from the `baseURL`
     * hostname. It is not a display string: a label with spaces in it
     * produces a source nothing can reach.
     */
    name?: string | undefined;
    /** Map of flat endpoint functions (not in any group) */
    endpoints: TEndpoints;
    /** None here: a source with groups beside its endpoints is the first overload. */
    groups?: NoGroups | undefined;
  } & ExposeWritten<TExpose>,
): DefinedFlatApi<TEndpoints, FromArguments<ExposeKept<TExpose>>>;

export function defineApi(
  config: BaseOptions & {
    name?: string | undefined;
    groups?: GroupRecord | undefined;
    endpoints?: EndpointRecord | undefined;
  },
): DefinedApi | DefinedFlatApi | DefinedMixedApi {
  /* What the definition says, read of its own: an option it does not name is unset. */
  const own = ownFields(config);
  const { endpoints, name, ...rest } = own;
  if (endpoints) assertNoReservedName(endpoints, "source");
  if (own.groups) assertNoReservedGroupName(own.groups);
  const result = endpoints
    ? Object.assign({ options: rest }, endpoints)
    : ({ options: rest } as DefinedApi);

  // Store name for studio identification
  const sourceName = name ?? deriveSourceName(own.baseURL);
  (result as Record<symbol, unknown>)[SOURCE_NAME_KEY] = sourceName;
  assertTransportOptions(rest, "source");
  assertCancelPrevious(own.cancelPrevious, `API "${sourceName}"`);

  announceSource(result, own.baseURL ?? "");

  return result;
}
