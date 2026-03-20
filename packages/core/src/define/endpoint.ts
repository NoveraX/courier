import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { CacheConfig, InferOutput, SchemaMetadata } from "../validation";
import { ENDPOINT_SCHEMA } from "../validation";
import type { Endpoint } from "./types";

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

export function endpoint<TResponse, TVariables = undefined>(): (
  fn: Endpoint<TResponse, TVariables>,
) => Endpoint<TResponse, TVariables>;

export function endpoint<TResponse, TVariables = undefined>(
  config: { response?: StandardSchemaV1; variables?: StandardSchemaV1 } & EndpointOptions,
): (fn: Endpoint<TResponse, TVariables>) => Endpoint<TResponse, TVariables>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- implementation must be wide enough for all overloads
export function endpoint(config?: SchemaMetadata & EndpointOptions) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches original overload implementation
  return (fn: Endpoint<any, any>) => {
    if (config) {
      (fn as unknown as Record<symbol, unknown>)[ENDPOINT_SCHEMA] = config;
    }
    return fn;
  };
}
