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

  const schema =
    typeof endpoint === "function"
      ? (endpoint as unknown as Record<symbol, SchemaMetadata | undefined>)[ENDPOINT_SCHEMA]
      : undefined;

  return { endpoint, endpointGroup, schema };
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
): MiddlewareContext {
  const { req: nextRequest, headers: nextHeaders } = context || {};
  const mergedNextHeaders = {
    ...headersToObject(nextRequest?.headers),
    ...headersToObject(nextHeaders),
  };
  const opts = dataSource.options as Record<string, unknown> | undefined;
  const allowedHeaders = opts?.allowedHeaders as string[] | undefined;
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
    response.headers.set("x-nexus-tags", schema.cache.tags.join(","));
  }
}
