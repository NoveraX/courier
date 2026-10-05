export {
  parseRequestPayload,
  type RequestPayload,
  type RequestPayloadInput,
} from "./request-payload";
export { compileUrl, extractParamNames, pathJoin, resolveBasePath } from "./url";

export const parseEndpointKey = (
  endpointKey: string,
): {
  group: string | undefined;
  method: string;
} => {
  const parts = endpointKey.split(":");
  const groupOrMethod = parts[0] ?? "";
  const method = parts[1];
  return {
    group: method ? groupOrMethod : undefined,
    method: method ?? groupOrMethod,
  };
};

export const headersToObject = (headers?: Headers): Record<string, string> | undefined => {
  if (!headers) return;
  return Object.fromEntries(headers.entries());
};

export const isFormData = (variables: unknown): variables is FormData =>
  typeof FormData !== "undefined" && variables instanceof FormData;

/**
 * Normalize HTTP method for external use.
 * Core uses `del` internally (reserved word), but APIs expect `DELETE`.
 *
 * @example normalizeHttpMethod("del") // → "DELETE"
 * @example normalizeHttpMethod("get") // → "GET"
 */
export function normalizeHttpMethod(method: string): string {
  const upper = method.toUpperCase();
  return upper === "DEL" ? "DELETE" : upper;
}

/**
 * Convert standard HTTP method to core's internal method name.
 * Inverse of `normalizeHttpMethod`.
 *
 * @example toInternalMethod("DELETE") // → "del"
 * @example toInternalMethod("GET") // → "get"
 */
export function toInternalMethod(method: string): string {
  const lower = method.toLowerCase();
  return lower === "delete" ? "del" : lower;
}

const READING_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS", "QUERY"]);

/**
 * Whether a verb only reads what it addresses, so a call made with it may be
 * sent again and its answer kept: GET, HEAD, OPTIONS, and QUERY, which asks
 * its question in a body.
 *
 * @param method - The verb, as HTTP spells it or as the client does (`"del"`)
 * @returns Whether it reads
 * @example
 * ```ts
 * isReadingMethod("query"); // → true
 * isReadingMethod("POST"); // → false
 * ```
 */
export function isReadingMethod(method: string): boolean {
  return READING_METHODS.has(normalizeHttpMethod(method));
}

const QUERY_STRING_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS", "DELETE"]);

/**
 * Whether a verb sends its variables in the query string rather than a
 * body: GET, HEAD, OPTIONS and DELETE. Every other verb — a write, or a
 * QUERY asking with a body — sends them as its body.
 *
 * @param method - The verb, as HTTP spells it or as the client does (`"del"`)
 * @returns Whether its variables go in the query string
 * @example
 * ```ts
 * sendsVariablesInQuery("del"); // → true
 * sendsVariablesInQuery("QUERY"); // → false
 * ```
 */
export function sendsVariablesInQuery(method: string): boolean {
  return QUERY_STRING_METHODS.has(normalizeHttpMethod(method));
}

export const isHeaders = (variables: unknown): variables is Headers =>
  typeof Headers !== "undefined" && variables instanceof Headers;

/** Estimate response body size in bytes (Content-Length → JSON fallback) */
export function estimateResponseSize(data: unknown, headers?: Headers): number {
  const cl = headers?.get("content-length");
  if (cl) {
    const parsed = parseInt(cl, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  if (data == null) return 0;
  try {
    return new TextEncoder().encode(JSON.stringify(data)).byteLength;
  } catch {
    /* A body JSON cannot write — a BigInt, a cycle — has no size to show;
       the answer itself is not affected. */
    return 0;
  }
}
