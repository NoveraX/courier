import { assertTransportOptions } from "../http-client/assert-transport-options";
import type { BaseOptions } from "../http-client/types";
import { assertSessionApi } from "../session/assert-session-api";
import { studioHooks } from "../studio";
import { isDevelopment } from "../utils/development";
import { assertCancelPrevious } from "./assert-cancel-previous";
import { assertNoReservedGroupName, assertNoReservedName } from "./assert-no-reserved-name";
import type {
  AnyDefinedApi,
  DefinedApi,
  DefinedFlatApi,
  DefinedMixedApi,
  EndpointRecord,
  GroupRecord,
  OwnEndpoints,
  OwnGroups,
} from "./types";

/** Symbol for storing source name on the source object — survives module duplication */
const SOURCE_NAME_KEY = Symbol.for("courier.source.name");

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

/** Read the stored source name from a source object */
export function getSourceName(source: unknown): string | undefined {
  if (!source || typeof source !== "object") return undefined;
  return (source as Record<symbol, unknown>)[SOURCE_NAME_KEY] as string | undefined;
}

/**
 * Whether a value is an API `defineApi` made — what a registry hands back
 * typed only as a source: every one carries the name it is registered or
 * defined under.
 *
 * @param value - The value to check
 * @returns `true` for a defined API
 * @example
 * ```ts
 * const source = getSources()?.[name];
 * if (isDefinedApi(source)) openStreams(source);
 * ```
 */
export function isDefinedApi(value: unknown): value is AnyDefinedApi {
  return getSourceName(value) !== undefined;
}

/**
 * Forcibly stamp `name` onto `source` as its canonical source name.
 *
 * Use when an explicit identifier (e.g. a `courier.config.ts` `sources` key)
 * must override the value derived inside `defineApi`. The internal symbol
 * stays private — call this helper instead of touching it directly.
 */
export function setSourceName(source: unknown, name: string): void {
  if (!source || typeof source !== "object") return;
  (source as Record<symbol, unknown>)[SOURCE_NAME_KEY] = name;
}

/**
 * Define an API source with groups of typed endpoints.
 *
 * @param config - The source's options, with its `groups`, its flat `endpoints`, or both
 * @returns The source: its endpoints, with its options beside them under `options`
 * @throws ConfigurationError `RESERVED_ENDPOINT_NAME` for a flat endpoint
 *   named `options`, `raw` or `with`, or a group named `raw` or `with`;
 *   `SESSION_OPTIONS_INVALID`, `SESSION_INSECURE_TRANSPORT`,
 *   `SESSION_HEADER_CONFLICT` or `FORWARD_OPTIONS_INVALID` for a `session`
 *   or a `forward` that cannot work as written; `CANCEL_PREVIOUS_INVALID`
 *   for a `cancelPrevious` that is neither `true` nor `false`
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
export function defineApi<TGroups extends OwnGroups, TEndpoints extends OwnEndpoints>(
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
  },
): DefinedMixedApi<TGroups, TEndpoints>;

export function defineApi<TGroups extends OwnGroups>(
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
  },
): DefinedApi<TGroups>;

export function defineApi<TEndpoints extends OwnEndpoints>(
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
  },
): DefinedFlatApi<TEndpoints>;

export function defineApi(
  config: BaseOptions & {
    name?: string | undefined;
    groups?: GroupRecord | undefined;
    endpoints?: EndpointRecord | undefined;
  },
): DefinedApi | DefinedFlatApi | DefinedMixedApi {
  const { endpoints, name, ...rest } = config;
  if (endpoints) assertNoReservedName(endpoints, "source");
  if (rest.groups) assertNoReservedGroupName(rest.groups);
  const result = endpoints
    ? Object.assign({ options: rest }, endpoints)
    : ({ options: rest } as DefinedApi);

  // Store name for studio identification
  const sourceName = name ?? deriveSourceName(config.baseURL);
  (result as Record<symbol, unknown>)[SOURCE_NAME_KEY] = sourceName;
  assertSessionApi(result, rest, sourceName);
  assertTransportOptions(rest, "source");
  assertCancelPrevious(rest.cancelPrevious, `API "${sourceName}"`);

  // Dev-only: notify studio of source (re)creation for HMR hot reload
  if (isDevelopment()) {
    studioHooks.onSourceDefined?.(result, config.baseURL ?? "");
  }

  return result;
}
