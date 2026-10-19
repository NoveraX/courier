/**
 * Postman Collection parser.
 */

import { groupNameClaimer } from "./group-name-claimer";
import { groupNameOf } from "./group-name-of";
import { collectionVariables, commonBase, requestBase } from "./postman-base";
import { type PostmanCollection, postmanEndpoint } from "./postman-endpoint";
import { walkPostmanFolders } from "./postman-folders";
import { authScheme } from "./postman-request";
import { gatheredPaths, sharedPrefix } from "./shared-path";
import { listAt, nodeAt, type SpecNode, textAt } from "./spec-node";
import { topLevelGroup } from "./top-level";
import type { ParsedEndpoint, ParsedGroup, ParsedSpec } from "./types";
import { uniqueEndpointNames } from "./unique-endpoint-names";
import { convertPathParams } from "./utils";

/**
 * Read a Postman collection: a group for each folder that holds requests,
 * named after the folder, and the collection's own requests in the API
 * itself. Folders are walked without recursion, however deep they nest.
 *
 * @param collection - The collection, as read from its JSON
 * @returns The parsed specification
 * @example
 * ```ts
 * parsePostman(JSON.parse(text)).groups.map((group) => group.name); // → ["users", "orders"]
 * ```
 */
export function parsePostman(collection: SpecNode): ParsedSpec {
  const info = nodeAt(collection, "info");
  const items = listAt(collection, "item");
  const variables = collectionVariables(collection);
  const auth = authScheme(nodeAt(collection, "auth"));
  const read: PostmanCollection = {
    variables,
    /* The base most requests share, not whichever host the first request
       names. */
    baseURL: commonBase(requestsIn(items).map((request) => requestBase(request.url, variables))),
    auth,
    skipped: [],
    securitySchemes: auth ? [auth] : [],
  };
  const groups: ParsedGroup[] = [];
  const claimGroupName = groupNameClaimer();
  walkPostmanFolders(
    items,
    (item, request, folder) => postmanEndpoint(item, request, folder, read),
    (folder, endpoints) => {
      if (endpoints.length === 0) return;
      /* `null` for the collection itself, whose requests sit in no folder and so in no group. */
      if (folder === null) groups.unshift(topLevelGroup(endpoints));
      else groups.push(folderGroup(folder, endpoints, claimGroupName));
    },
  );

  return {
    title: textAt(info, "name") ?? "Postman Collection",
    version: textAt(info, "version") ?? "1.0.0",
    description: "",
    /* Every request URL carries the host; hardcoding "/" pointed the client
       at the caller's own origin. */
    baseURL: read.baseURL ?? "/",
    format: "postman",
    groups,
    schemas: {},
    securitySchemes: read.securitySchemes,
    skipped: read.skipped,
  };
}

/* A folder's requests as a group, under the folder's name: two folders may carry the same name,
   and one group file would have overwritten the other. */
function folderGroup(
  folder: string,
  endpoints: ParsedEndpoint[],
  claimGroupName: (name: string) => string,
): ParsedGroup {
  const shared = gatheredPaths(endpoints.map((e) => e.fullPath));
  const prefix = sharedPrefix(shared);
  return {
    name: claimGroupName(groupNameOf(folder, shared.segments)),
    description: "",
    prefix: convertPathParams(prefix),
    endpoints: uniqueEndpointNames(endpoints, prefix).map((e) => ({
      ...e,
      path: convertPathParams(e.fullPath.slice(prefix.length) || "/"),
    })),
  };
}

/** Every request in the collection, however deep its folders nest, in the order it lists them. */
function requestsIn(items: readonly unknown[]): SpecNode[] {
  const requests: SpecNode[] = [];
  walkPostmanFolders(
    items,
    (_, request) => {
      requests.push(request);
      return undefined;
    },
    () => undefined,
  );
  return requests;
}
