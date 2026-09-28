import type { ParsedEndpoint } from "../parser/types";

/**
 * How a body is encoded, from its media type alone: JSON, or form fields
 * the client encodes, are structured; a multipart form is a form; anything
 * else is bytes.
 *
 * @param ep - The endpoint, which has a body
 * @returns The encoding
 * @example
 * ```ts
 * bodyMedia({ ...replaceFile, requestBodyMediaType: "application/octet-stream" }); // "bytes"
 * ```
 */
export function bodyMedia(ep: ParsedEndpoint): "structured" | "form" | "bytes" {
  const media = (ep.requestBodyMediaType ?? "application/json").toLowerCase();
  if (media.startsWith("multipart/form-data")) return "form";
  if (media.includes("json") || media.startsWith("application/x-www-form-urlencoded")) {
    return "structured";
  }
  return "bytes";
}
