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
 * so is one whose answer is not JSON, whose fields are sent url-encoded,
 * whose JSON body has a media type of its own, or whose query parameters are
 * written in a style of their own.
 */

import { toInternalMethod } from "@noverax/courier/internal";
import type { ParsedEndpoint } from "../parser/types";
import { callOptions as options } from "./call-options";
import { formClosure } from "./form-closure";
import { bodyKey, ownJsonMedia, type RequestBodyKind } from "./request-body";
import { isEventStream, type ResponseReading } from "./response-reading";
import { hasStyledQuery, styledQuery } from "./styled-query";
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
  const json = kind === "fields" || kind === "value" || kind === "nested";
  const placed = placingClosure(ep, method, at, kind, read, json ? ownJsonMedia(ep) : null);
  if (placed !== null) return placed;
  /* A stream is subscribed to by its address alone, so its query keeps the
     default style. */
  const styled = hasStyledQuery(ep) && !isEventStream(ep);
  if (read === null && !styled) return null;
  const vars = styled ? styledQuery("vars", ep.parameters) : "vars";
  return `(http, vars) => http.${method}(${at}, ${vars}${read === null ? "" : `, { ${read} }`})`;
}

const WRITES = new Set(["post", "put", "patch", "del"]);

function placingClosure(
  ep: ParsedEndpoint,
  method: string,
  at: string,
  kind: RequestBodyKind,
  read: string | null,
  media: string | null,
): string | null {
  if (!WRITES.has(method)) return null;
  const params = ep.parameters.filter((param) => param.in === "path" || param.in === "query");
  const query = params.filter((param) => param.in === "query");

  if (kind === "form") return formClosure(method, at, params, read);
  if (sendsUrlEncoded(ep, kind)) {
    return urlEncodedClosure(ep, method, at, read, kind === "nested" ? bodyKey(ep) : null);
  }
  if (kind === "value" || kind === "nested" || kind === "bytes") {
    return wholeBodyClosure(ep, method, at, kind, read, media);
  }
  if (method === "del") {
    if (kind === "none") return null;
    /* A body named in the options is sent as it is, so the path parameters
       are taken out of it here. */
    const { pattern, searchParams } = destructure(
      query,
      params.filter((p) => p.in === "path"),
    );
    const rest = pattern ? `${pattern}, ...body` : "...body";
    return `(http, { ${rest} }) => http.del(${at}, undefined, { ${options("json: body", searchParams, read, media)} })`;
  }
  const { pattern, searchParams } = destructure(query, []);
  if (searchParams === null && media === null) return null;
  /* The path is filled from every variable, whatever the closure passes. */
  if (kind === "none") {
    return `(http, { ${pattern} }) => http.${method}(${at}, undefined, { ${options(null, searchParams, read)} })`;
  }
  const body = pattern ? `{ ${pattern}, ...body }` : "body";
  return `(http, ${body}) => http.${method}(${at}, body, { ${options(null, searchParams, read, media)} })`;
}

function wholeBodyClosure(
  ep: ParsedEndpoint,
  method: string,
  at: string,
  kind: "value" | "nested" | "bytes",
  read: string | null,
  media: string | null,
): string | null {
  const option = kind === "bytes" ? "body" : "json";
  if (!ep.parameters.some((param) => param.in === "path" || param.in === "query")) {
    return method === "del" || media !== null
      ? `(http, body) => http.${method}(${at}, undefined, { ${options(`${option}: body`, null, read, media)} })`
      : null;
  }
  const key = bodyKey(ep);
  const { pattern, searchParams } = destructure(
    ep.parameters.filter((param) => param.in === "query"),
    [],
  );
  const bindings = pattern ? `${pattern}, ${key}` : key;
  return `(http, { ${bindings} }) => http.${method}(${at}, undefined, { ${options(`${option}: ${key}`, searchParams, read, media)} })`;
}

/**
 * Whether an endpoint sends its fields url-encoded, written by `formBody`:
 * a write whose body is a set of fields of that media type, beside the
 * parameters or under a key of its own.
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
  return (
    (kind === "fields" || kind === "nested") &&
    WRITES.has(toInternalMethod(ep.httpMethod)) &&
    isUrlEncoded(ep)
  );
}

function isUrlEncoded(ep: ParsedEndpoint): boolean {
  return (ep.requestBodyMediaType ?? "")
    .toLowerCase()
    .startsWith("application/x-www-form-urlencoded");
}
