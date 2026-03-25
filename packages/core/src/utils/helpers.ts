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
    return 0;
  }
}
