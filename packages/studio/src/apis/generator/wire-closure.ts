/**
 * The closure placing an endpoint's variables on the wire, when its verb
 * alone would put some of them in the wrong place.
 *
 * An endpoint addressed by its verb fills the path from its variables and
 * sends the rest as the body of a write, or as the query string of a read or
 * a DELETE. An operation taking query parameters beside a body sent them in
 * the JSON body, and zod and valibot, validating the body, dropped them
 * first; a DELETE with a body sent its fields as query parameters. Such an
 * endpoint is addressed by a closure that says where each variable goes.
 */

import { toInternalMethod } from "@noverax/courier";
import type { ParsedEndpoint } from "../parser/types";
import { formClosure } from "./form-closure";
import { bodyKey, type RequestBodyKind } from "./request-body";
import { destructure } from "./variable-bindings";

/**
 * The closure an endpoint needs, when its verb cannot place its variables.
 *
 * @param ep - The endpoint
 * @param path - Its path within the group, as the addressed form writes it
 * @param kind - The kind of body it sends
 * @returns The closure's source, or `null` when the verb places everything
 * @example
 * ```ts
 * wireClosure(replaceItem, "items/:item_id", "fields");
 * // '(http, { dryRun, ...body }) => http.put("items/:item_id", body, { searchParams: { dryRun } })'
 * ```
 */
export function wireClosure(
  ep: ParsedEndpoint,
  path: string,
  kind: RequestBodyKind,
): string | null {
  const method = toInternalMethod(ep.httpMethod);
  if (method !== "post" && method !== "put" && method !== "patch" && method !== "del") return null;
  const at = JSON.stringify(path);
  const params = ep.parameters.filter((param) => param.in === "path" || param.in === "query");
  const query = params.filter((param) => param.in === "query");

  if (kind === "form") return formClosure(method, at, params);
  if (kind === "value" || kind === "bytes") return wholeBodyClosure(ep, method, at, kind);
  if (method === "del") {
    if (kind === "none") return null;
    /* A body named in the options is sent as it is, so the path parameters
       are taken out of it here. */
    const { pattern, searchParams } = destructure(
      query,
      params.filter((p) => p.in === "path"),
    );
    const rest = pattern ? `${pattern}, ...body` : "...body";
    return `(http, { ${rest} }) => http.del(${at}, undefined, { ${withQuery("json: body", searchParams)} })`;
  }
  const { pattern, searchParams } = destructure(query, []);
  if (searchParams === null) return null;
  /* The path is filled from every variable, whatever the closure passes. */
  if (kind === "none") {
    return `(http, { ${pattern} }) => http.${method}(${at}, undefined, { searchParams: ${searchParams} })`;
  }
  return `(http, { ${pattern}, ...body }) => http.${method}(${at}, body, { searchParams: ${searchParams} })`;
}

/**
 * A body sent whole — a list or a scalar as JSON, bytes as they are. Beside
 * parameters it is passed under a key of its own, so it has to be taken out
 * of the variables; alone, it is the variables, which only a DELETE, sending
 * its variables as a query, cannot send as they are.
 */
function wholeBodyClosure(
  ep: ParsedEndpoint,
  method: string,
  at: string,
  kind: "value" | "bytes",
): string | null {
  const option = kind === "bytes" ? "body" : "json";
  if (!ep.parameters.some((param) => param.in === "path" || param.in === "query")) {
    return method === "del"
      ? `(http, body) => http.del(${at}, undefined, { ${option}: body })`
      : null;
  }
  const key = bodyKey(ep);
  const { pattern, searchParams } = destructure(
    ep.parameters.filter((param) => param.in === "query"),
    [],
  );
  const bindings = pattern ? `${pattern}, ${key}` : key;
  const options = withQuery(`${option}: ${key}`, searchParams);
  return `(http, { ${bindings} }) => http.${method}(${at}, undefined, { ${options} })`;
}

function withQuery(body: string, searchParams: string | null): string {
  return searchParams === null ? body : `${body}, searchParams: ${searchParams}`;
}
