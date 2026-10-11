import { groupOptionsOf } from "../define/group-options-of";
import { groupChain } from "../define/group-tree";
import type { ResolvedEndpointOptions } from "../define/options";
import type { GroupOptions } from "../http-client/types";
import { ENDPOINT_SCHEMA, type SchemaMetadata } from "../validation";
import { getEndpoint } from "./execute-helpers";
import { normalizeHttpMethod } from "./helpers";

/** The group an endpoint sits in, with the settings it takes from every group above it. */
type ResolvedGroup = { options: GroupOptions };

/** An endpoint found in a source, with what its descriptor says about it. */
interface ResolvedEndpoint {
  /** Its closure, or `undefined` when the source holds no such endpoint */
  endpoint: WireFn | undefined;
  endpointGroup: ResolvedGroup | undefined;
  schema: SchemaMetadata | undefined;
  options: ResolvedEndpointOptions | undefined;
  /** Whether the closure is the implementation rather than a wire description */
  served: boolean;
  /** The verb as HTTP spells it */
  httpMethod: string | undefined;
}

/**
 * Find an endpoint in a source: among the source's own endpoints, or in the
 * group its path names — `billing.invoices` — at any depth. A path that
 * names a group finds that group's endpoints alone, never one of the
 * source's own that happens to share the name.
 *
 * @param dataSource - The source
 * @param group - The group's path; empty or absent for the source's own endpoints
 * @param method - The endpoint's name
 * @returns The endpoint and what its descriptor says, its group's settings merged down its path
 * @example
 * ```ts
 * resolveEndpoint(api, "billing.invoices", "list").endpointGroup?.options.prefix; // → "billing/invoices"
 * ```
 */
export function resolveEndpoint(
  dataSource: Record<string, unknown>,
  group: unknown,
  method: unknown,
): ResolvedEndpoint {
  const grouped = typeof group === "string" && group !== "";
  const chain = grouped ? groupChain(dataSource, group) : [];
  const holder = chain === undefined ? undefined : (chain.at(-1) ?? dataSource);
  const endpoint =
    holder !== undefined && typeof method === "string" ? getEndpoint(holder, method) : undefined;
  const endpointGroup = chain?.length ? { options: groupOptionsOf(chain) } : undefined;

  return {
    endpoint: toCallable(endpoint),
    endpointGroup,
    schema: readSchema(endpoint),
    options: readOptions(endpoint),
    served: isServed(endpoint),
    httpMethod: readHttpMethod(endpoint),
  };
}

/** The verb the endpoint was addressed with, as HTTP spells it: `"DELETE"` for `.del()`. */
function readHttpMethod(endpoint: unknown): string | undefined {
  if (typeof endpoint !== "object" || endpoint === null || !("method" in endpoint))
    return undefined;
  const { method } = endpoint;
  return typeof method === "string" ? normalizeHttpMethod(method) : undefined;
}

/** Is the endpoint's closure its implementation rather than a wire description? */
function isServed(endpoint: unknown): boolean {
  return typeof endpoint === "object" && endpoint !== null && "served" in endpoint
    ? endpoint.served === true
    : false;
}

/**
 * Read the options an endpoint resolved at definition time.
 *
 * Everything the builder accumulated — middleware, forwarded headers, timeout,
 * retry — is flattened onto the descriptor, so the request path reads it from
 * one place rather than re-deriving it.
 */
function readOptions(endpoint: unknown): ResolvedEndpointOptions | undefined {
  if (typeof endpoint !== "object" || endpoint === null || !("options" in endpoint)) {
    return undefined;
  }
  const { options } = endpoint;
  return typeof options === "object" && options !== null
    ? (options as ResolvedEndpointOptions)
    : undefined;
}

type WireFn = (...args: unknown[]) => unknown;

/**
 * Recover the closure that performs the request.
 *
 * A descriptor keeps it under `probe`; nothing else about resolution depends
 * on which of the two an endpoint is.
 */
function toCallable(endpoint: unknown): WireFn | undefined {
  if (typeof endpoint !== "object" || endpoint === null || !("probe" in endpoint)) return undefined;
  const { probe } = endpoint;
  return isWireFn(probe) ? probe : undefined;
}

/* A closure is called with what the request hands it; it says what it takes. */
function isWireFn(value: unknown): value is WireFn {
  return typeof value === "function";
}

/** Read the metadata stamped on an endpoint, whichever shape it has. */
function readSchema(endpoint: unknown): SchemaMetadata | undefined {
  if (typeof endpoint !== "object" || endpoint === null || !(ENDPOINT_SCHEMA in endpoint)) {
    return undefined;
  }
  const schema = endpoint[ENDPOINT_SCHEMA];
  /* Every field of the metadata is optional: any object stamped there is one. */
  return typeof schema === "object" && schema !== null ? schema : undefined;
}

/**
 * The header names an endpoint carries across the proxy, in both directions:
 * the source's `allowedHeaders` and the endpoint's own `.headers()`. An
 * endpoint may name headers beyond what the source does; neither list narrows
 * the other.
 *
 * @param dataSource - The source the endpoint belongs to
 * @param endpointAllowedHeaders - The names the endpoint declared
 * @returns The names, or `undefined` when neither declares any
 *
 * @example
 * ```ts
 * namedHeadersOf(source, ["x-total-count"]); // → ["x-api-version", "x-total-count"]
 * ```
 */
export function namedHeadersOf(
  dataSource: Record<string, unknown>,
  endpointAllowedHeaders: readonly string[] | undefined,
): string[] | undefined {
  const opts = dataSource.options as Record<string, unknown> | undefined;
  const sourceAllowed = opts?.allowedHeaders as string[] | undefined;
  if (!endpointAllowedHeaders?.length && !sourceAllowed?.length) return undefined;
  return [...new Set([...(sourceAllowed ?? []), ...(endpointAllowedHeaders ?? [])])];
}
