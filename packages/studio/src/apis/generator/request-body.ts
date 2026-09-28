/**
 * What kind of body an endpoint sends, which decides how its variables are
 * typed and how they reach the wire.
 */

import { ownValue } from "../own-value";
import type { ParsedEndpoint, ParsedSchema, ParsedSpec } from "../parser/types";

/**
 * - `none` — the endpoint sends no body.
 * - `fields` — a JSON object, whose fields sit in the variables beside the
 *   parameters.
 * - `value` — JSON that is not an object with fields, a list above all; it
 *   cannot share the variables with the parameters, so beside them it is
 *   passed under a key of its own.
 * - `form` — a multipart form, taken as a `FormData`, whose entries also
 *   fill the path.
 * - `bytes` — a file or other bytes sent as they are, taken as a `Blob`.
 */
export type RequestBodyKind = "none" | "fields" | "value" | "form" | "bytes";

/**
 * The kind of body an endpoint sends.
 *
 * Every body used to be taken for JSON: a multipart upload was typed as an
 * object of strings no file fits in, and a body of bytes, or a list, was
 * dropped from the variables altogether.
 *
 * @param ep - The endpoint
 * @param spec - The specification, for the schemas a body names
 * @returns The kind
 * @example
 * ```ts
 * requestBodyKind({ ...uploadAvatar, requestBodyMediaType: "multipart/form-data" }, spec); // "form"
 * ```
 */
export function requestBodyKind(ep: ParsedEndpoint, spec: ParsedSpec): RequestBodyKind {
  if (!ep.requestBody) return "none";
  const media = bodyMedia(ep);
  if (media !== "structured") return media;
  return hasFields(ep.requestBody, spec, new Set()) ? "fields" : "value";
}

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

/**
 * The key a body that is not a set of fields takes beside the parameters:
 * `body`, unless a parameter is named that.
 *
 * @param ep - The endpoint
 * @returns The key
 * @example
 * ```ts
 * bodyKey(bulkTag); // "body"
 * ```
 */
export function bodyKey(ep: ParsedEndpoint): string {
  return ep.parameters.some((param) => param.name === "body") ? "requestBody" : "body";
}

/** An object with fields, a reference to one, or alternatives that all are. */
function hasFields(schema: ParsedSchema, spec: ParsedSpec, seen: Set<string>): boolean {
  if (schema.type === "object") return Object.keys(schema.properties ?? {}).length > 0;
  if (schema.type === "union") {
    return (schema.variants ?? []).every((variant) => hasFields(variant, spec, seen));
  }
  if (schema.type !== "ref" || !schema.refName || seen.has(schema.refName)) return false;
  seen.add(schema.refName);
  const target = ownValue(spec.schemas, schema.refName);
  return target !== undefined && hasFields(target, spec, seen);
}
