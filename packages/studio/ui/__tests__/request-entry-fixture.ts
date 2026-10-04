import type { RequestEntry } from "@/store";

/**
 * A request as the store holds it — a finished GET of `api.users.list` —
 * with the fields a test names in place of the defaults.
 *
 * @param fields - The fields that differ
 * @returns The request
 */
export function requestEntry(fields: Partial<RequestEntry> = {}): RequestEntry {
  return {
    id: "r1",
    source: "api",
    group: "users",
    method: "list",
    httpMethod: "GET",
    variables: undefined,
    mode: "direct",
    type: "query",
    status: "success",
    statusCode: 200,
    timing: { total: 120, middleware: 10, fetch: 100, validation: 5 },
    middlewareCount: 0,
    middlewareEntries: [],
    hasValidation: { variables: false, response: false },
    startedAt: 1_000_000,
    url: "http://localhost:5173/api/users?page=2",
    sessionId: "vite-browser",
    ...fields,
  };
}
