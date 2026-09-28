/**
 * What kind of body an endpoint sends, which decides how its variables are
 * typed and how they reach the wire.
 */

import { ownValue } from "../own-value";
import type { ParsedEndpoint, ParsedSchema, ParsedSpec } from "../parser/types";
import { bodyMedia } from "./body-media";
import { variableParameters } from "./variable-parameters";

/**
 * - `none` — the endpoint sends no body.
 * - `fields` — a JSON object, whose fields sit in the variables beside the
 *   parameters.
 * - `value` — JSON that is not an object with fields, a list above all; it
 *   cannot share the variables with the parameters, so beside them it is
 *   passed under a key of its own.
 * - `nested` — fields of which one shares its name with a path or query
 *   parameter; they cannot share one variables object with the parameters
 *   either, so they are passed under a key of their own too.
 * - `form` — a multipart form, taken as a `FormData`, whose entries also
 *   fill the path.
 * - `bytes` — a file or other bytes sent as they are, taken as a `Blob`.
 */
export type RequestBodyKind = "none" | "fields" | "value" | "nested" | "form" | "bytes";

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
  const fields = fieldNames(ep.requestBody, spec, new Set());
  if (fields === null) return "value";
  return sharesParameterName(ep, fields) ? "nested" : "fields";
}

/**
 * Whether one of a body's fields is named as a path or query parameter is.
 *
 * Both are keys of the one variables object an endpoint is called with.
 * Merged, the parameter took the field's place: Gitea's `POST
 * /repos/{owner}/{repo}/issues/{index}/blocks`, whose body names another
 * issue by its own `owner`, `repo` and `index`, sent the body without them.
 *
 * @param ep - The endpoint
 * @param fields - The names of its body's fields
 * @returns Whether a field and a parameter share a name
 * @example
 * ```ts
 * sharesParameterName(blockIssue, ["owner", "repo", "index"]); // → true
 * ```
 */
export function sharesParameterName(ep: ParsedEndpoint, fields: readonly string[]): boolean {
  const names = new Set(variableParameters(ep).map((param) => param.name));
  return fields.some((field) => names.has(field));
}

/**
 * The media type a JSON body is sent as, when the operation names one of its
 * own: a JSON Patch, a merge patch, JSON:API. Sent as `application/json`, it
 * was refused by an API that tells them apart by the media type.
 *
 * @param ep - The endpoint
 * @returns The declared media type, parameters included, or `null` for plain JSON and every other body
 * @example
 * ```ts
 * ownJsonMedia({ ...mergePet, requestBodyMediaType: "application/merge-patch+json" }); // "application/merge-patch+json"
 * ```
 */
export function ownJsonMedia(ep: ParsedEndpoint): string | null {
  const declared = ep.requestBodyMediaType?.trim();
  const base = declared?.split(";")[0]?.trim().toLowerCase();
  if (!declared || !base || base === "application/json" || !base.includes("json")) return null;
  return declared;
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

/**
 * The fields of an object with fields, of a reference to one, or of
 * alternatives that all are; `null` for any other body.
 */
function fieldNames(schema: ParsedSchema, spec: ParsedSpec, seen: Set<string>): string[] | null {
  if (schema.type === "object") {
    const names = Object.keys(schema.properties ?? {});
    return names.length > 0 ? names : null;
  }
  if (schema.type === "union") {
    const variants = (schema.variants ?? []).map((variant) => fieldNames(variant, spec, seen));
    return variants.every((names) => names !== null) ? variants.flat() : null;
  }
  if (schema.type !== "ref" || !schema.refName || seen.has(schema.refName)) return null;
  seen.add(schema.refName);
  const target = ownValue(spec.schemas, schema.refName);
  return target === undefined ? null : fieldNames(target, spec, seen);
}
