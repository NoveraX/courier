/**
 * HTTP method vocabularies shared by every specification parser.
 */

/**
 * Path-item keys that OpenAPI defines as operations. Anything outside this set
 * (`parameters`, `summary`, `servers`, `$ref`, vendor extensions) is metadata,
 * not a lost endpoint.
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
] as const;

/** The verbs the builder API can express: `endpoint.get`, `.head`, `.options`, `.post`, … */
export const SUPPORTED_METHODS = [
  "get",
  "head",
  "options",
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
