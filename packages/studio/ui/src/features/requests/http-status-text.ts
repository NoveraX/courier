const REASONS: ReadonlyMap<number, string> = new Map([
  [200, "OK"],
  [201, "Created"],
  [202, "Accepted"],
  [204, "No Content"],
  [206, "Partial Content"],
  [301, "Moved Permanently"],
  [302, "Found"],
  [304, "Not Modified"],
  [307, "Temporary Redirect"],
  [308, "Permanent Redirect"],
  [400, "Bad Request"],
  [401, "Unauthorized"],
  [403, "Forbidden"],
  [404, "Not Found"],
  [405, "Method Not Allowed"],
  [408, "Request Timeout"],
  [409, "Conflict"],
  [410, "Gone"],
  [413, "Content Too Large"],
  [415, "Unsupported Media Type"],
  [422, "Unprocessable Content"],
  [429, "Too Many Requests"],
  [500, "Internal Server Error"],
  [501, "Not Implemented"],
  [502, "Bad Gateway"],
  [503, "Service Unavailable"],
  [504, "Gateway Timeout"],
]);

/**
 * The reason phrase an HTTP status is known by.
 *
 * @param code - The status code
 * @returns Its phrase, or `undefined` for a code without a common one
 * @example
 * ```ts
 * httpStatusText(201); // "Created"
 * ```
 */
export function httpStatusText(code: number): string | undefined {
  return REASONS.get(code);
}
