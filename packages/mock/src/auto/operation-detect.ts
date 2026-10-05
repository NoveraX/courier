import { pathShape } from "../server/path-shape";
import type { CrudOperation } from "./route-types";

/* A QUERY reads as GET does, asking with a body: the collection's records,
   or the one record its path names. */
const COLLECTION_OPERATIONS = new Map<string, CrudOperation>([
  ["GET", "list"],
  ["QUERY", "list"],
  ["POST", "create"],
  ["PUT", "upsert"],
  ["DELETE", "deleteAll"],
]);

const RECORD_OPERATIONS = new Map<string, CrudOperation>([
  ["GET", "get"],
  ["QUERY", "get"],
  ["PUT", "replace"],
  ["PATCH", "update"],
  ["DELETE", "delete"],
]);

/**
 * Classify an endpoint as a CRUD operation from its HTTP method and the
 * shape of its path. The collection root takes the collection operations;
 * a path naming one record — `:id`, or a lookup such as `by-email/:email` —
 * takes the record operations. Everything else is custom: fixed sub-paths
 * (`stats`), paths that go on past a parameter (`:id/orders`), and methods
 * with no CRUD meaning on that shape (`POST :id/activate`).
 *
 * @param httpMethod Upper-case HTTP method
 * @param path       Endpoint path relative to its group
 * @returns The operation the auto mock serves the endpoint as
 * @example
 * ```ts
 * detectOperation("GET", "");            // "list"
 * detectOperation("PATCH", ":id");       // "update"
 * detectOperation("POST", ":id/activate"); // "custom"
 * ```
 */
export function detectOperation(httpMethod: string, path: string): CrudOperation {
  switch (pathShape(path)) {
    case "collection":
      return COLLECTION_OPERATIONS.get(httpMethod) ?? "custom";
    case "record":
    case "lookup":
      return RECORD_OPERATIONS.get(httpMethod) ?? "custom";
    default:
      return "custom";
  }
}
