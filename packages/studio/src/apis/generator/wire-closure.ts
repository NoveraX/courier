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
import { isReservedBinding } from "../parser/reserved-bindings";
import type { ParsedEndpoint, ParsedParameter } from "../parser/types";
import { objectKey } from "./literals";

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/* Bound by the closure itself, or not bindable in a module. */
const TAKEN = new Set(["http", "body", "arguments", "eval"]);

/**
 * The closure an endpoint needs, when its verb cannot place its variables.
 *
 * @param ep - The endpoint
 * @param path - Its path within the group, as the addressed form writes it
 * @returns The closure's source, or `null` when the verb places everything
 * @example
 * ```ts
 * wireClosure(replaceItem, "items/:item_id");
 * // '(http, { dryRun, ...body }) => http.put("items/:item_id", body, { searchParams: { dryRun } })'
 * ```
 */
export function wireClosure(ep: ParsedEndpoint, path: string): string | null {
  const method = toInternalMethod(ep.httpMethod);
  const query = ep.parameters.filter((param) => param.in === "query");
  const at = JSON.stringify(path);

  if ((method === "post" || method === "put" || method === "patch") && query.length > 0) {
    const { pattern, searchParams } = destructure(query, []);
    /* The path is filled from every variable, whatever the closure passes. */
    if (!ep.requestBody) {
      return `(http, { ${pattern} }) => http.${method}(${at}, undefined, { searchParams: ${searchParams} })`;
    }
    return `(http, { ${pattern}, ...body }) => http.${method}(${at}, body, { searchParams: ${searchParams} })`;
  }
  if (method === "del" && ep.requestBody) {
    /* A body named in the options is sent as it is, so the path parameters
       are taken out of it here. */
    const pathParams = ep.parameters.filter((param) => param.in === "path");
    const { pattern, searchParams } = destructure(query, pathParams);
    const options = query.length > 0 ? `json: body, searchParams: ${searchParams}` : "json: body";
    const rest = pattern ? `${pattern}, ...body` : "...body";
    return `(http, { ${rest} }) => http.del(${at}, undefined, { ${options} })`;
  }
  return null;
}

/**
 * Take parameters out of the variables: the query parameters, to be sent
 * in the query string, and the ones only to be left out of the body. A name
 * that cannot be bound as it is — `page-size`, `class`, `body` — is taken
 * under a local name of its own.
 */
function destructure(
  query: readonly ParsedParameter[],
  omitted: readonly ParsedParameter[],
): { pattern: string; searchParams: string } {
  const pattern: string[] = [];
  const fields: string[] = [];
  [...query, ...omitted].forEach((param, index) => {
    const local = bindable(param.name) ? param.name : `param${index}`;
    const binding = local === param.name ? local : `${objectKey(param.name)}: ${local}`;
    pattern.push(binding);
    if (index < query.length) fields.push(binding);
  });
  return { pattern: pattern.join(", "), searchParams: `{ ${fields.join(", ")} }` };
}

function bindable(name: string): boolean {
  return IDENTIFIER.test(name) && !isReservedBinding(name) && !TAKEN.has(name);
}
