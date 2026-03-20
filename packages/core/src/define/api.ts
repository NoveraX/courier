import { devtoolsHooks } from "../devtools";
import type { BaseOptions } from "../http-client/types";
import type {
  DefinedApi,
  DefinedFlatApi,
  DefinedMixedApi,
  EndpointRecord,
  GroupRecord,
} from "./types";

/** Symbol for storing source name on the source object — survives module duplication */
const SOURCE_NAME_KEY = Symbol.for("nexus.source.name");

/** Derive a human-readable name from baseURL hostname */
function deriveSourceName(baseURL?: string): string {
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
 * Define an API source with groups of typed endpoints.
 *
 * @example
 * // With groups:
 * const api = defineApi({
 *   baseURL: "https://api.example.com",
 *   groups: { users: usersGroup, posts: postsGroup },
 * })
 *
 * // Flat (no groups):
 * const api = defineApi({
 *   baseURL: "https://api.example.com",
 *   endpoints: {
 *     getUsers: endpoint<User[]>()((http) => http.get("/users")),
 *   },
 * })
 *
 * // Mixed (groups + flat endpoints):
 * const api = defineApi({
 *   baseURL: "https://api.example.com",
 *   groups: { users: usersGroup },
 *   endpoints: {
 *     healthCheck: endpoint()((http) => http.get("/health")),
 *   },
 * })
 */
export function defineApi<TGroups extends GroupRecord, TEndpoints extends EndpointRecord>(
  config: BaseOptions & {
    /** Human-readable source name for devtools and logging (derived from baseURL if omitted) */
    name?: string;
    /** Map of named endpoint groups created with defineGroup() */
    groups: TGroups;
    /** Map of flat endpoint functions (not in any group) */
    endpoints: TEndpoints;
  },
): DefinedMixedApi<TGroups, TEndpoints>;

export function defineApi<TGroups extends GroupRecord>(
  config: BaseOptions & {
    /** Human-readable source name for devtools and logging (derived from baseURL if omitted) */
    name?: string;
    /** Map of named endpoint groups created with defineGroup() */
    groups: TGroups;
  },
): DefinedApi<TGroups>;

export function defineApi<TEndpoints extends EndpointRecord>(
  config: BaseOptions & {
    /** Human-readable source name for devtools and logging (derived from baseURL if omitted) */
    name?: string;
    /** Map of flat endpoint functions (not in any group) */
    endpoints: TEndpoints;
  },
): DefinedFlatApi<TEndpoints>;

export function defineApi(
  config: BaseOptions & { name?: string; groups?: GroupRecord; endpoints?: EndpointRecord },
): DefinedApi | DefinedFlatApi | DefinedMixedApi {
  const { endpoints, name, ...rest } = config;
  const result = endpoints
    ? Object.assign({ options: rest }, endpoints)
    : ({ options: rest } as DefinedApi);

  // Store name for devtools identification
  const sourceName = name ?? deriveSourceName(config.baseURL);
  (result as Record<symbol, unknown>)[SOURCE_NAME_KEY] = sourceName;

  // Dev-only: notify devtools of source (re)creation for HMR hot reload
  if (process.env.NODE_ENV !== "production") {
    devtoolsHooks.onSourceDefined?.(result, config.baseURL ?? "");
  }

  return result;
}
