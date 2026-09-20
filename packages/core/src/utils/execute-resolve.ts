import type { ResolvedEndpointOptions } from "../define/options";
import type { Context, GroupOptions } from "../http-client/types";
import type { MiddlewareContext } from "../middleware/types";
import { ENDPOINT_SCHEMA, type SchemaMetadata } from "../validation";
import { getEndpoint } from "./execute-helpers";
import { headersToObject } from "./helpers";
import { mergeHeaders } from "./merge-headers";

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
  };
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

export function buildMiddlewareContext(
  source: unknown,
  group: unknown,
  method: unknown,
  variables: unknown,
  baseHeaders: unknown,
  context: Context | undefined,
  dataSource: Record<string, unknown>,
  requestId: string,
  transport?: "http" | "sse" | "ws",
  endpointAllowedHeaders?: readonly string[],
): MiddlewareContext {
  const { req: nextRequest, headers: nextHeaders } = context || {};
  const mergedNextHeaders = {
    ...headersToObject(nextRequest?.headers),
    ...headersToObject(nextHeaders),
  };
  const opts = dataSource.options as Record<string, unknown> | undefined;
  const sourceAllowed = opts?.allowedHeaders as string[] | undefined;
  /* An endpoint may forward headers beyond what the source allows; neither
     list narrows the other. */
  const allowedHeaders =
    endpointAllowedHeaders?.length || sourceAllowed?.length
      ? [...new Set([...(sourceAllowed ?? []), ...(endpointAllowedHeaders ?? [])])]
      : undefined;
  const newHeaders = mergeHeaders(
    baseHeaders as HeadersInit | Record<string, string | undefined> | undefined,
    mergedNextHeaders,
    allowedHeaders,
  );

  return {
    source: String(source),
    group: group ? String(group) : undefined,
    method: String(method),
    variables,
    headers: newHeaders,
    transport,
    _requestId: requestId || undefined,
  };
}

export function applyCacheHeaders(response: Response, schema: SchemaMetadata): void {
  if (schema.cache?.revalidate !== undefined) {
    response.headers.set(
      "Cache-Control",
      `s-maxage=${schema.cache.revalidate}, stale-while-revalidate`,
    );
  }
  if (schema.cache?.tags?.length) {
    response.headers.set("x-courier-tags", schema.cache.tags.join(","));
  }
}
