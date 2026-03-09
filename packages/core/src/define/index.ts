import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { BaseOptions } from "../instance/types";
import {
  type CacheConfig,
  ENDPOINT_SCHEMA,
  type InferOutput,
  type SchemaMetadata,
} from "../validation";
import type {
  DefinedApi,
  DefinedGroup,
  DefineGroupConfig,
  Endpoint,
  EndpointRecord,
  GroupRecord,
} from "./types";

export type {
  AnySource,
  DefinedApi,
  DefinedGroup,
  DefineGroupConfig,
  Endpoint,
  EndpointRecord,
  GroupRecord,
  Sources,
} from "./types";

/** Options for endpoint type and cache hints (no schemas) */
type EndpointOptions = {
  /** "query" enables GET proxy requests; "mutation" requires POST (default) */
  type?: "query" | "mutation";
  /** Cache hints for proxy GET responses */
  cache?: CacheConfig;
};

/**
 * Type-safe endpoint definition with optional Standard Schema validation.
 * Uses double-call pattern for partial generic inference.
 *
 * @example
 * // Explicit types:
 * endpoint<User[]>()((http) => http.get())
 * endpoint<User, { id: string }>()((http, vars) => http.get(":id", vars))
 *
 * // With schema (types inferred automatically):
 * endpoint({ response: z.array(UserSchema) })((http) => http.get())
 * endpoint({ response: UserSchema, variables: CreateUserSchema })((http, vars) => http.post("", vars))
 *
 * // With HTTP-semantic proxy hints:
 * endpoint<User[]>({ type: "query", cache: { revalidate: 60 } })((http) => http.get())
 */
export function endpoint<RS extends StandardSchemaV1, VS extends StandardSchemaV1>(
  config: { response: RS; variables: VS } & EndpointOptions,
): (fn: Endpoint<InferOutput<RS>, InferOutput<VS>>) => Endpoint<InferOutput<RS>, InferOutput<VS>>;

export function endpoint<RS extends StandardSchemaV1>(
  config: { response: RS } & EndpointOptions,
): (fn: Endpoint<InferOutput<RS>>) => Endpoint<InferOutput<RS>>;

export function endpoint<VS extends StandardSchemaV1>(
  config: { variables: VS } & EndpointOptions,
): (fn: Endpoint<unknown, InferOutput<VS>>) => Endpoint<unknown, InferOutput<VS>>;

export function endpoint<R, V = undefined>(): (fn: Endpoint<R, V>) => Endpoint<R, V>;

export function endpoint<R, V = undefined>(
  config: EndpointOptions,
): (fn: Endpoint<R, V>) => Endpoint<R, V>;

export function endpoint(config?: SchemaMetadata) {
  return (fn: Endpoint<any, any>) => {
    if (config) {
      (fn as any)[ENDPOINT_SCHEMA] = config;
    }
    return fn;
  };
}

/**
 * Define an endpoint group with a prefix and typed endpoints.
 *
 * @example
 * const users = defineGroup({
 *   prefix: "users",
 *   endpoints: {
 *     getAll: endpoint<User[]>()((http) => http.get()),
 *     getById: endpoint<User, { id: string }>()((http, vars) => http.get(":id", vars)),
 *   },
 * })
 */
export function defineGroup<E extends EndpointRecord>(
  config: DefineGroupConfig<E>,
): DefinedGroup<E> {
  const { endpoints, ...groupOptions } = config;
  return Object.assign({ options: groupOptions }, endpoints);
}

/**
 * Define an API source with groups of typed endpoints.
 *
 * @example
 * const api = defineApi({
 *   baseURL: "https://api.example.com",
 *   groups: {
 *     users: usersGroup,
 *     posts: postsGroup,
 *   },
 * })
 */
export function defineApi<G extends GroupRecord>(
  config: BaseOptions & { groups: G },
): DefinedApi<G> {
  return { options: config };
}
