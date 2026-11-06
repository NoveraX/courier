import type { ParsedEndpoint, ParsedParameter, ParsedSchema } from "../parser/types";
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
 * twice; and every one beside a multipart form taken as a `FormData`, which
 * is the whole of what such a call is made with.
 *
 * @param ep - The endpoint
 * @returns Its header parameters
 * @example
 * ```ts
 * headerParameters(findThings).map((param) => param.name); // ["X-Digest"]
 * ```
 */
export function headerParameters(ep: ParsedEndpoint): ParsedParameter[] {
  const taken = new Set(placedParameters(ep).map((param) => param.name));
  const headers = ep.parameters.filter(
    (param) =>
      param.in === "header" &&
      !CLIENT_HEADERS.has(param.name.toLowerCase()) &&
      !taken.has(param.name),
  );
  if (!ep.requestBody || bodyMedia(ep) !== "form") return headers;
  const names = new Set([...taken, ...headers.map((param) => param.name)]);
  return isRecordForm(ep.requestBody, names) ? headers : [];
}

/* Whether a multipart form is called with a record of its fields, as
   `requestBodyKind` tells with the specification: its schema names them,
   and none is named as a parameter is. Told without it, a schema that refers
   to another is taken to name some, as it almost always does. */
function isRecordForm(body: ParsedSchema, parameters: ReadonlySet<string>): boolean {
  if (body.type === "ref") return true;
  const fields = Object.keys(body.properties ?? {}).filter((name) => name !== "");
  return (
    body.type === "object" && fields.length > 0 && !fields.some((name) => parameters.has(name))
  );
}

/* The path's first, then the query's, as the variables have always listed them. */
function placedParameters(ep: ParsedEndpoint): ParsedParameter[] {
  return (["path", "query"] as const).flatMap((place) =>
    ep.parameters.filter((param) => param.in === place),
  );
}
