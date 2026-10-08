import { ERROR_CODE, errorOf, type JsonRpcResponse } from "../protocol/json-rpc";

/* The errors 2026-07-28 answers with a status of their own; every other answer is a 200. */
const MODERN_STATUS: ReadonlyMap<number, number> = new Map([
  [ERROR_CODE.methodNotFound, 404],
  [ERROR_CODE.invalidParams, 400],
  [ERROR_CODE.invalidRequest, 400],
  [ERROR_CODE.parse, 400],
  [ERROR_CODE.headerMismatch, 400],
  [ERROR_CODE.missingCapability, 400],
  [ERROR_CODE.unsupportedVersion, 400],
]);

/** The headers a request may carry across origins, when a browser-based client sends it. */
export const REQUEST_HEADERS =
  "content-type, authorization, mcp-protocol-version, mcp-method, mcp-name, mcp-session-id, last-event-id";

/**
 * A JSON-RPC response as an HTTP one.
 *
 * Under 2026-07-28 an unknown method is a 404 and a malformed or
 * unsupported request a 400, which a client tells a modern server apart by;
 * the revisions opened with `initialize` answer every JSON-RPC error with a
 * 200, as their clients expect.
 *
 * @param response - The JSON-RPC response
 * @param modern - Whether the request was served under 2026-07-28
 * @param headers - Headers to add: the CORS ones a browser-based client needs
 * @returns The HTTP response
 * @example
 * ```ts
 * rpcResponse(errorOf(1, ERROR_CODE.methodNotFound, "Method not found: x"), true); // 404
 * ```
 */
export function rpcResponse(
  response: JsonRpcResponse,
  modern: boolean,
  headers?: HeadersInit,
): Response {
  const code = "error" in response ? response.error.code : undefined;
  const status = code !== undefined && modern ? (MODERN_STATUS.get(code) ?? 200) : 200;
  return Response.json(response, { status, ...(headers !== undefined && { headers }) });
}

/**
 * A refusal before any request could be read: a status, and a JSON-RPC
 * error with no id saying why.
 *
 * @param status - The HTTP status
 * @param message - Why the request was refused
 * @param headers - Headers to add
 * @param code - The JSON-RPC code: an invalid request, unless the body was no JSON at all
 * @returns The HTTP response
 * @example
 * ```ts
 * refusal(403, "Origin not allowed");
 * ```
 */
export function refusal(
  status: number,
  message: string,
  headers?: HeadersInit,
  code: number = ERROR_CODE.invalidRequest,
): Response {
  return Response.json(errorOf(null, code, message), {
    status,
    ...(headers !== undefined && { headers }),
  });
}

/**
 * The CORS headers for a request a browser sent from another origin the
 * handler accepts; none for one with no origin, which no browser sent.
 *
 * @param origin - The request's `Origin` header
 * @returns The headers
 * @example
 * ```ts
 * corsHeaders("https://inspector.example.com");
 * ```
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  if (origin === null) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": REQUEST_HEADERS,
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}
