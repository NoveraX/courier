import type { IncomingMessage } from "node:http";
import type { EntryHeaders } from "./adapter/entry-request";

/**
 * A Node request's headers, read as a web request's are: by their name in
 * any case, a header sent more than once as its values joined. Node trims
 * each value and joins repeated ones as `Headers` does, so the two read
 * alike; none is copied for it. Taking one off takes it off the request.
 *
 * @param nodeReq - The request
 * @returns Its headers
 * @example
 * ```ts
 * nodeHeadersOf(req).get("Origin"); // "https://app.example.com", or null
 * ```
 */
export function nodeHeadersOf(nodeReq: IncomingMessage): EntryHeaders {
  const { headers } = nodeReq;
  return {
    get(name) {
      const value = headers[name.toLowerCase()];
      if (value === undefined) return null;
      return typeof value === "string" ? value : value.join(", ");
    },
    has(name) {
      return headers[name.toLowerCase()] !== undefined;
    },
    delete(name) {
      Reflect.deleteProperty(headers, name.toLowerCase());
    },
  };
}
