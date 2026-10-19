import { isSupportedMethod } from "./http-methods";
import { requestBase } from "./postman-base";
import {
  authScheme,
  requestBody,
  requestBodyMediaType,
  requestParameters,
  requestPath,
} from "./postman-request";
import { nodeAt, type SpecNode, textAt } from "./spec-node";
import type { ParsedEndpoint, ParsedSecurityScheme, SkippedOperation } from "./types";
import { convertPathParams, toCamelCase } from "./utils";

/** What every request of one collection is read with, and what reading them adds to. */
export interface PostmanCollection {
  readonly variables: ReadonlyMap<string, string>;
  /** The base most requests share. */
  readonly baseURL: string | undefined;
  readonly auth: ParsedSecurityScheme | undefined;
  readonly skipped: SkippedOperation[];
  readonly securitySchemes: ParsedSecurityScheme[];
}

/**
 * The endpoint a request of a Postman collection is, or `undefined` for one
 * whose method the endpoint builder has no counterpart for, which is noted
 * among what the collection skipped. A request's own authentication is added
 * to the collection's schemes the first time it is met.
 *
 * @param item - The request's item, which names it
 * @param request - The request
 * @param folder - The folder it sits in, or `null` for the collection itself
 * @param collection - The collection it is read in
 * @returns The endpoint
 * @example
 * ```ts
 * postmanEndpoint(item, nodeAt(item, "request"), "Users", collection)?.httpMethod; // → "get"
 * ```
 */
export function postmanEndpoint(
  item: SpecNode,
  request: SpecNode,
  folder: string | null,
  collection: PostmanCollection,
): ParsedEndpoint | undefined {
  const method = (textAt(request, "method") ?? "GET").toLowerCase();
  const path = requestPath(request.url);
  if (!isSupportedMethod(method)) {
    const verb = method.toUpperCase();
    collection.skipped.push({
      method: verb,
      path,
      reason: `${verb} has no counterpart in the endpoint builder`,
    });
    return undefined;
  }
  const ownAuth = authScheme(nodeAt(request, "auth"));
  if (ownAuth && !collection.securitySchemes.some((scheme) => scheme.name === ownAuth.name)) {
    collection.securitySchemes.push(ownAuth);
  }
  const body = requestBody(nodeAt(request, "body"));
  const mediaType = body ? requestBodyMediaType(nodeAt(request, "body")) : undefined;
  const base = requestBase(request.url, collection.variables);
  return {
    name: toCamelCase(textAt(item, "name") ?? `${method}${path}`),
    operationId: null,
    httpMethod: method,
    path: convertPathParams(path),
    fullPath: path,
    description: textAt(item, "name") ?? "",
    secured: Boolean(ownAuth ?? collection.auth),
    requestBody: body,
    ...(mediaType && { requestBodyMediaType: mediaType }),
    parameters: requestParameters(request.url),
    responseSchema: null,
    tags: folder === null ? [] : [folder],
    /* A request written with a host of its own is still sent there. */
    ...(base !== undefined && base !== collection.baseURL && { origin: base }),
  };
}
