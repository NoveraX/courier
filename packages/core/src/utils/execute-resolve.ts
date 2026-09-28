import type { ResolvedEndpointOptions } from "../define/options";
import type { GroupOptions } from "../http-client/types";
import { ENDPOINT_SCHEMA, type SchemaMetadata } from "../validation";
import { getEndpoint } from "./execute-helpers";

type ResolvedGroup = Record<string, unknown> & { options?: GroupOptions };

export function resolveEndpoint(
  dataSource: Record<string, unknown>,
  group: unknown,
  method: unknown,
) {
  const endpointGroup: ResolvedGroup | undefined =
    typeof group === "string" &&
    dataSource.options &&
    "groups" in (dataSource.options as Record<string, unknown>)
      ? ((dataSource.options as Record<string, Record<string, unknown>>)?.groups?.[group] as
          | ResolvedGroup
          | undefined)
      : undefined;

  const endpoint =
    typeof method === "string"
      ? (endpointGroup && getEndpoint(endpointGroup, method)) || getEndpoint(dataSource, method)
      : undefined;

  return {
    endpoint: toCallable(endpoint),
    endpointGroup,
    schema: readSchema(endpoint),
    options: readOptions(endpoint),
    served: isServed(endpoint),
  };
}

/** Is the endpoint's closure its implementation rather than a wire description? */
function isServed(endpoint: unknown): boolean {
  if (typeof endpoint !== "object" || endpoint === null) return false;
  return (endpoint as { served?: unknown }).served === true;
}

/**
 * Read the options an endpoint resolved at definition time.
 *
 * Everything the builder accumulated — middleware, forwarded headers, timeout,
 * retry — is flattened onto the descriptor, so the request path reads it from
 * one place rather than re-deriving it.
 */
function readOptions(endpoint: unknown): ResolvedEndpointOptions | undefined {
  if (typeof endpoint !== "object" || endpoint === null) return undefined;
  const { options } = endpoint as { options?: unknown };
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
  if (typeof endpoint !== "object" || endpoint === null) return undefined;
  const { probe } = endpoint as { probe?: unknown };
  return typeof probe === "function" ? (probe as WireFn) : undefined;
}

/** Read the metadata stamped on an endpoint, whichever shape it has. */
function readSchema(endpoint: unknown): SchemaMetadata | undefined {
  if (typeof endpoint !== "object" || endpoint === null) return undefined;
  return (endpoint as Record<symbol, SchemaMetadata | undefined>)[ENDPOINT_SCHEMA];
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
