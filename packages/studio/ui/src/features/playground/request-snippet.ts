import {
  fillPathParams,
  pathParamNames,
  sendsVariablesInQuery,
  withoutTrailingSlashes,
} from "@noverax/courier/internal";

import type { SnippetInput } from "@/lib/snippets";
import type { EndpointInfo, SourceInfo } from "@/store/types-ui";
import { queryString, withQuery } from "./query-string";
import type { RequestValues } from "./request-values";

/**
 * The URL an endpoint is served at, with its path parameters as `:name`:
 * the source's base URL, then the group's prefix, then the endpoint's path.
 *
 * @param source - The endpoint's source
 * @param prefix - The prefix of the endpoint's group
 * @param endpoint - The endpoint
 * @returns The URL, or `""` when where it is served is unknown: an endpoint
 *   only seen in traffic, or a stream or a channel, which the app serves
 *
 * @example
 * ```ts
 * endpointUrl({ baseURL: "http://localhost:7501", groups: {} }, "users", byId);
 * // → "http://localhost:7501/users/:id"
 * ```
 */
export function endpointUrl(
  source: SourceInfo | null,
  prefix: string,
  endpoint: EndpointInfo | null,
): string {
  if (!source || !endpoint || endpoint.path === undefined || endpoint.transport) return "";
  return [source.baseURL, prefix, endpoint.path]
    .filter((part) => part !== "")
    .reduce(
      (url, part) =>
        url === "" ? part : `${withoutTrailingSlashes(url)}/${part.replace(/^\/+/, "")}`,
      "",
    );
}

/**
 * The request the Playground would send, as a URL, cURL or fetch snippet
 * writes it: the path parameters filled from the variables, and the rest
 * of the variables in the query string of a method without a body, or as
 * the JSON body of one with.
 *
 * @param url - The endpoint's URL, as `endpointUrl` gives it
 * @param endpoint - The endpoint, whose HTTP method is used
 * @param values - The variables and headers to send
 * @returns The snippet's URL, method, headers and body
 *
 * @example
 * ```ts
 * snippetInput("http://localhost:7501/users/:id", byId, { variables: { id: 2 }, headers: {} }).url;
 * // → "http://localhost:7501/users/2"
 * ```
 */
export function snippetInput(
  url: string,
  endpoint: EndpointInfo,
  values: RequestValues,
): SnippetInput {
  const method = endpoint.httpMethod ?? (endpoint.type === "mutation" ? "POST" : "GET");
  const { variables, headers } = values;
  const fields = isRecord(variables) ? variables : undefined;
  const params = new Set(pathParamNames(url));
  const filled = fillPathParams(url, (name) => {
    const value = fields?.[name];
    return value === undefined || value === "" ? `:${name}` : encodeURIComponent(String(value));
  });
  const rest = fields
    ? Object.fromEntries(Object.entries(fields).filter(([name]) => !params.has(name)))
    : variables;

  if (sendsVariablesInQuery(method)) {
    return { url: withQuery(filled, queryString(isRecord(rest) ? rest : {})), method, headers };
  }
  const hasBody = isRecord(rest) ? Object.keys(rest).length > 0 : rest !== undefined;
  return { url: filled, method, headers, ...(hasBody && { body: rest }) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
