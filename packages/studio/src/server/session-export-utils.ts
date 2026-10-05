/**
 * Shared utilities for session export formats.
 */

import { sendsVariablesInQuery } from "@noverax/courier/internal";

const STATUS_MAP: Record<number, string> = {
  200: "OK",
  201: "Created",
  204: "No Content",
  301: "Moved Permanently",
  304: "Not Modified",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
};

export function statusText(code?: number): string {
  if (!code) return "";
  return STATUS_MAP[code] ?? "";
}

/**
 * The verb a saved request went out with, and the body it carried: the
 * variables of a write or a QUERY. A GET's, a HEAD's, an OPTIONS' or a
 * DELETE's went in the query string, which the request's URL carries.
 *
 * @param req - The saved request
 * @returns Its verb, as HTTP spells it, and its body when it sent one
 * @example
 * ```ts
 * sentRequest({ httpMethod: "get", variables: { page: 2 } }); // → { method: "GET", body: undefined }
 * ```
 */
export function sentRequest(req: { httpMethod?: string | undefined; variables?: unknown }): {
  method: string;
  body: unknown;
} {
  const method = (req.httpMethod ?? "GET").toUpperCase();
  const body = sendsVariablesInQuery(method) ? undefined : req.variables;
  return { method, body };
}

/**
 * The query a request's URL carries, as name and value pairs: none for a
 * request seen only by its endpoint's name.
 *
 * @param url - The request's URL
 * @returns The pairs, in order
 * @example
 * ```ts
 * queryPairs("http://api.example/users?page=2"); // → [{ name: "page", value: "2" }]
 * ```
 */
export function queryPairs(url: string | undefined): Array<{ name: string; value: string }> {
  if (url === undefined || !URL.canParse(url)) return [];
  return [...new URL(url).searchParams].map(([name, value]) => ({ name, value }));
}
