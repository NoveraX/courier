import type { ParsedEndpoint, ParsedParameter } from "../parser/types";
import { bodyMedia } from "./body-media";

/* A header OpenAPI tells a client to ignore as a parameter: it sets it itself. */
const CLIENT_HEADERS: ReadonlySet<string> = new Set(["accept", "content-type", "authorization"]);

/**
 * The parameters an endpoint is called with: its path's, its query's, and
 * the headers it takes per call.
 *
 * @param ep - The endpoint
 * @returns The parameters, path first, then query, then headers
 * @example
 * ```ts
 * variableParameters(findThings).map((param) => param.name); // ["q", "X-Digest"]
 * ```
 */
export function variableParameters(ep: ParsedEndpoint): ParsedParameter[] {
  return [...placedParameters(ep), ...headerParameters(ep)];
}

/**
 * The header parameters an endpoint is called with, which
 * `headerVariablesMiddleware` sends as headers. Left out: one a client sets
 * itself (`Accept`, `Content-Type`, `Authorization`), as OpenAPI says; one
 * named like a path or query parameter, which the variables cannot hold
 * twice; and every one beside a multipart form, which is the whole of what
 * such a call is made with.
 *
 * @param ep - The endpoint
 * @returns Its header parameters
 * @example
 * ```ts
 * headerParameters(findThings).map((param) => param.name); // ["X-Digest"]
 * ```
 */
export function headerParameters(ep: ParsedEndpoint): ParsedParameter[] {
  if (ep.requestBody && bodyMedia(ep) === "form") return [];
  const taken = new Set(placedParameters(ep).map((param) => param.name));
  return ep.parameters.filter(
    (param) =>
      param.in === "header" &&
      !CLIENT_HEADERS.has(param.name.toLowerCase()) &&
      !taken.has(param.name),
  );
}

/* The path's first, then the query's, as the variables have always listed them. */
function placedParameters(ep: ParsedEndpoint): ParsedParameter[] {
  return (["path", "query"] as const).flatMap((place) =>
    ep.parameters.filter((param) => param.in === place),
  );
}
