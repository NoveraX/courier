/**
 * HTTP method inference for endpoints discovered by the catalog scanner.
 *
 * Heuristics are used when an endpoint type is missing (legacy sources or
 * hand-written endpoints) — for typed endpoints we trust the explicit
 * `httpMethod` returned by the analyzer.
 */

/**
 * Infer the HTTP method for an endpoint from name + analysis metadata.
 *
 * @param endpointName - Endpoint identifier (e.g. `getUser`, `createPost`)
 * @param type - Whether the endpoint is a query or mutation, when known
 * @param path - Endpoint path template — used to discriminate POST vs PATCH
 * @returns One of `GET | POST | PUT | PATCH | DELETE`
 */
export function inferHttpMethod(
  endpointName: string,
  type: "query" | "mutation" | undefined,
  path: string | undefined,
): string {
  // Queries are always GET
  if (type === "query") return "GET";

  // Mutations: infer from endpoint name
  if (type === "mutation") {
    const lower = endpointName.toLowerCase();
    if (lower.startsWith("create") || lower.startsWith("add") || lower.startsWith("insert")) return "POST";
    if (lower.startsWith("delete") || lower.startsWith("remove") || lower === "del") return "DELETE";
    if (lower.startsWith("patch")) return "PATCH";
    if (lower.startsWith("update") || lower.startsWith("put") || lower.startsWith("replace")) return "PUT";
    // Mutation with :id path → PATCH, without → POST
    return path?.includes(":") ? "PATCH" : "POST";
  }

  // No type annotation: infer from name patterns
  const lower = endpointName.toLowerCase();
  if (lower.startsWith("get") || lower.startsWith("list") || lower.startsWith("find") || lower.startsWith("fetch")) return "GET";
  if (lower.startsWith("create") || lower.startsWith("add") || lower.startsWith("insert")) return "POST";
  if (lower.startsWith("update") || lower.startsWith("put") || lower.startsWith("replace")) return "PUT";
  if (lower.startsWith("patch") || lower.startsWith("edit")) return "PATCH";
  if (lower.startsWith("delete") || lower.startsWith("remove")) return "DELETE";

  return "GET";
}
