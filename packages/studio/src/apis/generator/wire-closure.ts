/**
 * The closure placing an endpoint's variables on the wire, when its verb
 * alone would put some of them in the wrong place.
 *
 * An endpoint addressed by its verb fills the path from its variables and
 * sends the rest as the body of a write, or as the query string of a read or
 * a DELETE. An operation taking query parameters beside a body sent them in
 * the JSON body, and zod and valibot, validating the body, dropped them
 * first; a DELETE with a body sent its fields as query parameters. Such an
 * endpoint is addressed by a closure that says where each variable goes, and
 * so is one whose answer is not JSON, or whose fields are sent url-encoded.
 */

import { toInternalMethod } from "@noverax/courier";
import type { ParsedEndpoint } from "../parser/types";
import { callOptions as options } from "./call-options";
import { formClosure } from "./form-closure";
import { bodyKey, type RequestBodyKind } from "./request-body";
import type { ResponseReading } from "./response-reading";
import { urlEncodedClosure } from "./url-encoded-closure";
import { destructure } from "./variable-bindings";

/**
 * The closure an endpoint needs, when its verb cannot place its variables
 * or read its answer.
 *
 * @param ep - The endpoint
 * @param path - Its path within the group, as the addressed form writes it
 * @param kind - The kind of body it sends
 * @param reading - How its answer is read; a closure names any reading but JSON
 * @returns The closure's source, or `null` when the verb places and reads everything
 * @example
 * ```ts
 * wireClosure(replaceItem, "items/:item_id", "fields", "json");
 * // '(http, { dryRun, ...body }) => http.put("items/:item_id", body, { searchParams: { dryRun } })'
 * ```
 */
export function wireClosure(
  ep: ParsedEndpoint,
  path: string,
  kind: RequestBodyKind,
  reading: ResponseReading = "json",
): string | null {
  const read = reading === "json" ? null : `responseType: ${JSON.stringify(reading)}`;
  const method = toInternalMethod(ep.httpMethod);
  const at = JSON.stringify(path);
  const placed = placingClosure(ep, method, at, kind, read);
  if (placed !== null || read === null) return placed;
  return `(http, vars) => http.${method}(${at}, vars, { ${read} })`;
}

const WRITES = new Set(["post", "put", "patch", "del"]);

function placingClosure(
  ep: ParsedEndpoint,
  method: string,
  at: string,
  kind: RequestBodyKind,
  read: string | null,
): string | null {
  if (!WRITES.has(method)) return null;
  const params = ep.parameters.filter((param) => param.in === "path" || param.in === "query");
  const query = params.filter((param) => param.in === "query");

  if (kind === "form") return formClosure(method, at, params, read);
  if (kind === "value" || kind === "bytes") return wholeBodyClosure(ep, method, at, kind, read);
  if (sendsUrlEncoded(ep, kind)) return urlEncodedClosure(ep, method, at, read);
  if (method === "del") {
    if (kind === "none") return null;
    /* A body named in the options is sent as it is, so the path parameters
       are taken out of it here. */
    const { pattern, searchParams } = destructure(
      query,
      params.filter((p) => p.in === "path"),
    );
    const rest = pattern ? `${pattern}, ...body` : "...body";
    return `(http, { ${rest} }) => http.del(${at}, undefined, { ${options("json: body", searchParams, read)} })`;
  }
  const { pattern, searchParams } = destructure(query, []);
  if (searchParams === null) return null;
  /* The path is filled from every variable, whatever the closure passes. */
  if (kind === "none") {
    return `(http, { ${pattern} }) => http.${method}(${at}, undefined, { ${options(null, searchParams, read)} })`;
  }
  return `(http, { ${pattern}, ...body }) => http.${method}(${at}, body, { ${options(null, searchParams, read)} })`;
}

function wholeBodyClosure(
  ep: ParsedEndpoint,
  method: string,
  at: string,
  kind: "value" | "bytes",
  read: string | null,
): string | null {
  const option = kind === "bytes" ? "body" : "json";
  if (!ep.parameters.some((param) => param.in === "path" || param.in === "query")) {
    return method === "del"
      ? `(http, body) => http.del(${at}, undefined, { ${options(`${option}: body`, null, read)} })`
      : null;
  }
  const key = bodyKey(ep);
  const { pattern, searchParams } = destructure(
    ep.parameters.filter((param) => param.in === "query"),
    [],
  );
  const bindings = pattern ? `${pattern}, ${key}` : key;
  return `(http, { ${bindings} }) => http.${method}(${at}, undefined, { ${options(`${option}: ${key}`, searchParams, read)} })`;
}

/**
 * Whether an endpoint sends its fields url-encoded, written by `formBody`:
 * a write whose body is a set of fields of that media type.
 *
 * @param ep - The endpoint
 * @param kind - The kind of body it sends
 * @returns Whether its closure writes the body with `formBody`
 * @example
 * ```ts
 * sendsUrlEncoded({ ...createCustomer, requestBodyMediaType: "application/x-www-form-urlencoded" }, "fields"); // → true
 * ```
 */
export function sendsUrlEncoded(ep: ParsedEndpoint, kind: RequestBodyKind): boolean {
  return kind === "fields" && WRITES.has(toInternalMethod(ep.httpMethod)) && isUrlEncoded(ep);
}

function isUrlEncoded(ep: ParsedEndpoint): boolean {
  return (ep.requestBodyMediaType ?? "")
    .toLowerCase()
    .startsWith("application/x-www-form-urlencoded");
}
