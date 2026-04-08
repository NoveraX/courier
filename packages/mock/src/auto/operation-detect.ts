import type { CrudOperation } from "./route-types";

/**
 * CRUD operation classification from HTTP method + path shape.
 *
 * Extracted from `route-analyzer.ts` so that the heuristic mapping
 * (HTTP verb + presence of `:id` + static sub-paths → CRUD operation)
 * lives in a single, easily auditable place.
 */

/** Detect CRUD operation from HTTP method + path pattern */
export function detectOperation(
  httpMethod: string,
  hasIdParam: boolean,
  path: string,
): CrudOperation {
  const isStaticSubPath = !!path && !path.startsWith(":");

  switch (httpMethod) {
    case "GET":
      if (hasIdParam) return "get";
      // Static sub-paths (e.g. "browse", "categories") are custom endpoints, not list
      if (isStaticSubPath) return "custom";
      return "list";
    case "POST":
      return isStaticSubPath ? "custom" : "create";
    case "PUT":
      return hasIdParam ? "replace" : "upsert";
    case "PATCH":
      return hasIdParam ? "update" : "custom";
    case "DELETE":
      return hasIdParam || path ? "delete" : "deleteAll";
    default:
      return "custom";
  }
}
