/**
 * HTTP method vocabularies shared by every specification parser.
 */

/**
 * Path-item keys that OpenAPI defines as operations — `query` since 3.2.
 * Anything outside this set (`parameters`, `summary`, `servers`, `$ref`,
 * `additionalOperations`, vendor extensions) is not an operation of its own.
 */
export const OPERATION_KEYS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
  "query",
] as const;

/** The verbs the builder API can express: `endpoint.get`, `.head`, `.options`, `.query`, `.post`, … */
export const SUPPORTED_METHODS = [
  "get",
  "head",
  "options",
  "query",
  "post",
  "put",
  "patch",
  "delete",
] as const;

export type SupportedHttpMethod = (typeof SUPPORTED_METHODS)[number];

export function isOperationKey(key: string): boolean {
  return (OPERATION_KEYS as readonly string[]).includes(key);
}

export function isSupportedMethod(method: string): method is SupportedHttpMethod {
  return (SUPPORTED_METHODS as readonly string[]).includes(method);
}
