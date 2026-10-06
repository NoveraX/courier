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
import { asNode, fieldOf, listAt, nodeAt, type SpecNode, textAt } from "./spec-node";
import { topLevelGroup } from "./top-level";
import type {
  ParsedEndpoint,
  ParsedGroup,
  ParsedSecurityScheme,
  ParsedSpec,
  SkippedOperation,
} from "./types";
import { uniqueEndpointNames } from "./unique-endpoint-names";
import { convertPathParams, findCommonPrefix, toCamelCase, toGroupName } from "./utils";

export function parsePostman(collection: SpecNode): ParsedSpec {
  const info = nodeAt(collection, "info");
  const title = textAt(info, "name") ?? "Postman Collection";
  const version = textAt(info, "version") ?? "1.0.0";

  const groups: ParsedGroup[] = [];
  const takenGroupNames = new Set<string>();
  const skipped: SkippedOperation[] = [];
  const securitySchemes: ParsedSecurityScheme[] = [];
  const collectionAuth = authScheme(nodeAt(collection, "auth"));
  if (collectionAuth) securitySchemes.push(collectionAuth);
  const variables = collectionVariables(collection);
  /* The base most requests share, not whichever host the first request
     names. */
  const baseURL = commonBase(
    requestsIn(listAt(collection, "item")).map((request) => requestBase(request.url, variables)),
  );

  /* `null` for the collection itself, whose requests sit in no folder and so in no group. */
  function processItems(items: readonly unknown[], groupName: string | null) {
    const endpoints: ParsedEndpoint[] = [];

    for (const entry of items) {
      const item = asNode(entry);
      if (item.item) {
        processItems(listAt(item, "item"), textAt(item, "name") ?? groupName ?? "");
        continue;
      }

      const request = nodeAt(item, "request");
      if (!request) continue;

      const method = (textAt(request, "method") ?? "GET").toLowerCase();
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

      const ownAuth = authScheme(nodeAt(request, "auth"));
      if (ownAuth && !securitySchemes.some((s) => s.name === ownAuth.name)) {
        securitySchemes.push(ownAuth);
      }
      const body = requestBody(nodeAt(request, "body"));
      const mediaType = body ? requestBodyMediaType(nodeAt(request, "body")) : undefined;

      endpoints.push({
        name: toCamelCase(textAt(item, "name") ?? `${method}${path}`),
        operationId: null,
        httpMethod: method,
        path: convertPathParams(path),
        fullPath: path,
        description: textAt(item, "name") ?? "",
        secured: Boolean(ownAuth ?? collectionAuth),
        requestBody: body,
        ...(mediaType && { requestBodyMediaType: mediaType }),
        parameters: requestParameters(request.url),
        responseSchema: null,
        tags: groupName === null ? [] : [groupName],
        /* A request written with a host of its own is still sent there. */
        ...(base !== undefined && base !== baseURL && { origin: base }),
      });
    }

    if (groupName === null) {
      if (endpoints.length > 0) groups.unshift(topLevelGroup(endpoints));
      return;
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

  processItems(listAt(collection, "item"), null);

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
function requestsIn(items: readonly unknown[]): SpecNode[] {
  return items.flatMap((item): SpecNode[] => {
    if (fieldOf(item, "item")) return requestsIn(listAt(item, "item"));
    const request = nodeAt(item, "request");
    return request ? [request] : [];
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
