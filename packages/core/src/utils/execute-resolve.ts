import type { ResolvedEndpointOptions } from "../define/options";
import type { Context, GroupOptions } from "../http-client/types";
import type { MiddlewareContext } from "../middleware/types";
import { ENDPOINT_SCHEMA, type SchemaMetadata } from "../validation";
import { getEndpoint } from "./execute-helpers";
import { headersToObject } from "./helpers";
import { filterHeaders, mergeHeaders } from "./merge-headers";

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

export interface MiddlewareContextInput {
  source: unknown;
  group: unknown;
  method: unknown;
  variables: unknown;
  /** Headers the caller passed explicitly, if any. */
  baseHeaders?: unknown;
  context?: Context;
  dataSource: Record<string, unknown>;
  requestId: string;
  transport?: "http" | "sse" | "ws";
  endpointAllowedHeaders?: readonly string[];
  /** Whether the endpoint reads or writes, from its schema. */
  kind?: "query" | "mutation";
  /** Fires when the caller stops waiting for the call. */
  signal?: AbortSignal;
}

export function buildMiddlewareContext(input: MiddlewareContextInput): MiddlewareContext {
  const {
    source,
    group,
    method,
    variables,
    baseHeaders,
    context,
    dataSource,
    requestId,
    transport,
    endpointAllowedHeaders,
    kind,
    signal,
  } = input;
  const { req: nextRequest, headers: nextHeaders } = context || {};
  const mergedNextHeaders = {
    ...headersToObject(nextRequest?.headers),
    ...headersToObject(nextHeaders),
  };
  const allowedHeaders = namedHeadersOf(dataSource, endpointAllowedHeaders);
  /* The caller's own headers go on top of the ones it forwards. A header it
     set — a service token for a backend the end user may not reach — is its
     explicit choice, and the incoming request's copy used to replace it. */
  const newHeaders = filterHeaders(mergedNextHeaders, allowedHeaders);
  mergeHeaders(baseHeaders as HeadersInit | Record<string, string | undefined> | undefined).forEach(
    (value, name) => {
      newHeaders.set(name, value);
    },
  );

  return {
    source: String(source),
    group: group ? String(group) : undefined,
    method: String(method),
    variables,
    headers: newHeaders,
    transport,
    request: nextRequest,
    kind,
    signal,
    _requestId: requestId || undefined,
  };
}

/**
 * Request headers that do not say who is asking.
 *
 * The decision used to run the other way, naming the credentials it knew —
 * and a caller authenticating with anything else, an `X-Api-Key` say, got a
 * response marked cacheable by every CDN between them and the server. Listing
 * what is safe instead means an unfamiliar header makes the answer private
 * rather than public.
 */
const IMPERSONAL_REQUEST_HEADERS: ReadonlySet<string> = new Set([
  "accept",
  "accept-encoding",
  "accept-language",
  "cache-control",
  "connection",
  "content-length",
  "content-type",
  "dnt",
  "host",
  "origin",
  "pragma",
  "referer",
  "te",
  "upgrade-insecure-requests",
  "user-agent",
]);

/** Whether anything in the request ties the answer to one caller. */
function identifiesCaller(request: Request | undefined): boolean {
  if (!request) return true;
  for (const name of request.headers.keys()) {
    const header = name.toLowerCase();
    if (IMPERSONAL_REQUEST_HEADERS.has(header)) continue;
    if (header.startsWith("sec-fetch-") || header.startsWith("sec-ch-")) continue;
    return true;
  }
  return false;
}

/**
 * Describe to caches how long this response keeps, and to whom it belongs.
 *
 * A response produced from a request carrying credentials is that caller's
 * alone, so it is kept privately in their own client rather than offered to a
 * shared cache. Otherwise it may be shared, and `Vary` names every forwarded
 * header that could have changed it so a shared cache keys on them instead of
 * handing one caller's response to another.
 */
export function applyCacheHeaders(
  response: Response,
  schema: SchemaMetadata,
  forwarded?: Headers,
  request?: Request,
): void {
  if (schema.cache?.revalidate !== undefined) {
    /* Read the request as it arrived: the forwarded set has already dropped
       whatever the allowlist does not carry upstream, so a credential can be
       missing from it while the answer still belongs to one caller. */
    const personal = identifiesCaller(request);
    const varyOn = forwarded ? [...forwarded.keys()].sort() : [];

    response.headers.set(
      "Cache-Control",
      personal
        ? `private, max-age=${schema.cache.revalidate}`
        : `s-maxage=${schema.cache.revalidate}, stale-while-revalidate`,
    );
    if (!personal && varyOn.length > 0) {
      response.headers.set("Vary", varyOn.join(", "));
    }
  }
  if (schema.cache?.tags?.length) {
    response.headers.set("x-courier-tags", schema.cache.tags.join(","));
  }
}
