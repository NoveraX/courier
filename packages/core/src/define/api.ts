import type { BaseOptions } from "../http-client/types";
import { studioHooks } from "../studio";
import { isDevelopment } from "../utils/development";
import { assertNoReservedGroupName, assertNoReservedName } from "./assert-no-reserved-name";
import type {
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
 *   named `options`, `raw` or `with`, or a group named `raw` or `with`
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
 * // With proxyPath (per-transport proxy endpoints, used by createProxyCaller
 * // and read by Studio Playground via the source map):
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
     * It must equal the key this source has in the `sources` map, because a
     * browser client reads it off its own copy of the definition while the
     * server resolves it against the registry, and the two have to agree.
     * Omitted, it is derived from the `baseURL` hostname. It is not a display
     * string: a label with spaces in it produces a source nothing can reach.
     */
    name?: string;
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
     * It must equal the key this source has in the `sources` map, because a
     * browser client reads it off its own copy of the definition while the
     * server resolves it against the registry, and the two have to agree.
     * Omitted, it is derived from the `baseURL` hostname. It is not a display
     * string: a label with spaces in it produces a source nothing can reach.
     */
    name?: string;
    /** Map of named endpoint groups created with defineGroup() */
    groups: TGroups;
  },
): DefinedApi<TGroups>;

export function defineApi<TEndpoints extends OwnEndpoints>(
  config: BaseOptions & {
    /**
     * The identifier the proxy addresses this source by — `?_s=<name>`.
     *
     * It must equal the key this source has in the `sources` map, because a
     * browser client reads it off its own copy of the definition while the
     * server resolves it against the registry, and the two have to agree.
     * Omitted, it is derived from the `baseURL` hostname. It is not a display
     * string: a label with spaces in it produces a source nothing can reach.
     */
    name?: string;
    /** Map of flat endpoint functions (not in any group) */
    endpoints: TEndpoints;
  },
): DefinedFlatApi<TEndpoints>;

export function defineApi(
  config: BaseOptions & { name?: string; groups?: GroupRecord; endpoints?: EndpointRecord },
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

  // Dev-only: notify studio of source (re)creation for HMR hot reload
  if (isDevelopment()) {
    studioHooks.onSourceDefined?.(result, config.baseURL ?? "");
  }

  return result;
}
