import {
  buildCurlSnippet,
  buildFetchSnippet as buildFetchSnippetShared,
  safeStringify,
} from "@/lib/snippets";
import type { RequestEntry } from "@/store/types";

/** Build a cURL command from a request entry */
export function buildCurl(r: RequestEntry): string {
  return buildCurlSnippet({
    url: r.url ?? `/${r.source}/${r.group}/${r.method}`,
    method: r.httpMethod ?? "GET",
    headers: r.requestHeaders,
    body: r.variables,
  });
}

/** Build a fetch() snippet from a request entry */
export function buildFetchSnippet(r: RequestEntry): string {
  return buildFetchSnippetShared({
    url: r.url ?? `/${r.source}/${r.group}/${r.method}`,
    method: r.httpMethod ?? "GET",
    headers: r.requestHeaders,
    body: r.variables,
  });
}

/** Build a JSON representation of a request entry */
export function buildRequestJson(r: RequestEntry): string {
  return safeStringify({
    id: r.id,
    source: r.source,
    group: r.group,
    method: r.method,
    httpMethod: r.httpMethod,
    mode: r.mode,
    type: r.type,
    status: r.status,
    statusCode: r.statusCode,
    url: r.url,
    variables: r.variables,
    data: r.data,
    timing: r.timing,
    headers: r.headers,
    error: r.error,
  }, 2);
}
