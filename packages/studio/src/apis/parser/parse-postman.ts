/**
 * Postman Collection parser.
 */

import { isSupportedMethod } from "./http-methods";
import { collectionVariables, commonBase, requestBase } from "./postman-base";
import {
  authScheme,
  requestBody,
  requestBodyMediaType,
  requestParameters,
  requestPath,
} from "./postman-request";
import type {
  ParsedEndpoint,
  ParsedGroup,
  ParsedSecurityScheme,
  ParsedSpec,
  SkippedOperation,
  SpecNode,
} from "./types";
import { uniqueEndpointNames } from "./unique-endpoint-names";
import { convertPathParams, findCommonPrefix, toCamelCase, toGroupName } from "./utils";

export function parsePostman(collection: SpecNode): ParsedSpec {
  const title = collection.info?.name ?? "Postman Collection";
  const version = collection.info?.version ?? "1.0.0";

  const groups: ParsedGroup[] = [];
  const takenGroupNames = new Set<string>();
  const skipped: SkippedOperation[] = [];
  const securitySchemes: ParsedSecurityScheme[] = [];
  const collectionAuth = authScheme(collection.auth);
  if (collectionAuth) securitySchemes.push(collectionAuth);
  const variables = collectionVariables(collection);
  /* The base most requests share; the first request to name a host used to
     decide it for all of them. */
  const baseURL = commonBase(
    requestsIn(collection.item).map((request) => requestBase(request.url, variables)),
  );

  function processItems(items: SpecNode[], groupName: string) {
    const endpoints: ParsedEndpoint[] = [];

    for (const item of items) {
      if (item.item) {
        processItems(item.item, item.name ?? groupName);
        continue;
      }

      const request = item.request;
      if (!request) continue;

      const method = (request.method ?? "GET").toLowerCase();
      const path = requestPath(request.url);
      const base = requestBase(request.url, variables);

      if (!isSupportedMethod(method)) {
        skipped.push({
          method: method.toUpperCase(),
          path,
          reason: `${method.toUpperCase()} has no counterpart in the endpoint builder`,
        });
        continue;
      }

      const ownAuth = authScheme(request.auth);
      if (ownAuth && !securitySchemes.some((s) => s.name === ownAuth.name)) {
        securitySchemes.push(ownAuth);
      }
      const body = requestBody(request.body);
      const mediaType = body ? requestBodyMediaType(request.body) : undefined;

      endpoints.push({
        name: toCamelCase(item.name ?? `${method}${path}`),
        operationId: null,
        httpMethod: method,
        path: convertPathParams(path),
        fullPath: path,
        description: item.name ?? "",
        secured: Boolean(ownAuth ?? collectionAuth),
        requestBody: body,
        ...(mediaType && { requestBodyMediaType: mediaType }),
        parameters: requestParameters(request.url),
        responseSchema: null,
        tags: [groupName],
        /* A request written with a host of its own is still sent there. */
        ...(base !== undefined && base !== baseURL && { origin: base }),
      });
    }

    if (endpoints.length > 0) {
      const prefix = findCommonPrefix(endpoints.map((e) => e.fullPath));
      groups.push({
        /* Two folders may carry the same name; one group file would have
           overwritten the other. */
        name: claimGroupName(toGroupName(groupName), takenGroupNames),
        description: "",
        prefix: convertPathParams(prefix),
        endpoints: uniqueEndpointNames(endpoints, prefix).map((e) => ({
          ...e,
          path: convertPathParams(e.fullPath.slice(prefix.length) || "/"),
        })),
      });
    }
  }

  processItems(collection.item ?? [], "default");

  return {
    title,
    version,
    description: "",
    /* Every request URL carries the host; hardcoding "/" pointed the client
       at the caller's own origin. */
    baseURL: baseURL ?? "/",
    format: "postman",
    groups,
    schemas: {},
    securitySchemes,
    skipped,
  };
}

/** Every request in the collection, however deep its folders nest. */
function requestsIn(items: unknown): SpecNode[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item: SpecNode | null | undefined): SpecNode[] => {
    if (item?.item) return requestsIn(item.item);
    return item?.request ? [item.request] : [];
  });
}

/** Take a group name, or the first numbered variant still free. */
function claimGroupName(name: string, taken: Set<string>): string {
  let candidate = name;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${name}${n}`;
    n += 1;
  }
  taken.add(candidate);
  return candidate;
}
