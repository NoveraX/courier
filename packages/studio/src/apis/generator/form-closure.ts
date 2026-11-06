/**
 * The closure of an endpoint that takes a multipart form.
 */

import type { ParsedEndpoint, ParsedParameter } from "../parser/types";
import { callOptions } from "./call-options";
import { destructuringClosure } from "./destructuring-closure";
import { jsLiteral, objectKey } from "./literals";
import { styledQuery } from "./styled-query";
import { destructure } from "./variable-bindings";

/**
 * The closure of an endpoint that takes a multipart form whose fields its
 * schema names: the path and query parameters are taken out of the
 * variables, and the rest are written as the body by `multipartBody`, a file
 * among them or not — a record that holds none would go as JSON, which such
 * an API refuses. Taking nothing out, it hands the variables on whole, so
 * the upload a proxy sends on as it arrives reaches the upstream as it is.
 *
 * @param ep - The endpoint
 * @param method - The verb, as the endpoint builder names it
 * @param at - The endpoint's path within its group, as a string literal
 * @param read - How the answer is read, as an options entry, when not as JSON
 * @returns The closure's source
 * @example
 * ```ts
 * multipartClosure(uploadFile, "post", '"files"', null);
 * // '(http, body) => http.post("files", void 0, { body: multipartBody(body) })'
 * ```
 */
export function multipartClosure(
  ep: ParsedEndpoint,
  method: string,
  at: string,
  read: string | null,
): string {
  const { pattern, searchParams, ownCopy } = destructure(
    ep.parameters.filter((param) => param.in === "query"),
    ep.parameters.filter((param) => param.in === "path"),
  );
  const options = callOptions("body: multipartBody(body)", searchParams, read);
  const call = `http.${method}(${at}, void 0, { ${options} })`;
  if (!pattern) return `(http, body) => ${call}`;
  return destructuringClosure(`${pattern}, ...body`, call, ownCopy);
}

/**
 * Place a form's entries on the wire, when its verb cannot.
 *
 * The form is the whole of the variables — the only shape the proxy carries
 * a file in — so a query parameter the operation takes beside it is one of
 * its entries too. That entry is sent in the query string and left out of
 * the form sent as the body, and a DELETE sends the form as its body rather
 * than as a query.
 *
 * @param method - The verb, as the endpoint builder names it
 * @param at - The endpoint's path within its group, as a string literal
 * @param params - The operation's path and query parameters
 * @param read - How the answer is read, as an options entry, when not as JSON
 * @returns The closure's source, or `null` when the verb places the form
 * @example
 * ```ts
 * formClosure("post", '"files/content"', [fieldsQuery]);
 * // '(http, form) => { const body = new FormData(); … return http.post("files/content", body, { searchParams: { fields: form.getAll("fields") } }); }'
 * ```
 */
export function formClosure(
  method: string,
  at: string,
  params: readonly ParsedParameter[],
  read: string | null = null,
): string | null {
  const query = params.filter((param) => param.in === "query");
  if (query.length === 0) {
    return method === "del"
      ? `(http, form) => http.del(${at}, void 0, { ${callOptions("body: form", null, read)} })`
      : null;
  }
  const values = `{ ${query.map((param) => `${objectKey(param.name)}: ${entry(param)}`).join(", ")} }`;
  const searchParams = styledQuery(values, query);
  const send =
    method === "del"
      ? `http.del(${at}, void 0, { ${callOptions("body", searchParams, read)} })`
      : `http.${method}(${at}, body, { ${callOptions(null, searchParams, read)} })`;
  /* The path's entries fill the path, and are not part of the body either. */
  const taken = jsLiteral(params.map((param) => param.name));
  const copy = `const body = new globalThis.FormData(); form.forEach((value, key) => { if (!${taken}.includes(key)) body.append(key, value); });`;
  return `(http, form) => { ${copy} return ${send}; }`;
}

/** A query parameter's value, read from the form: every entry of a list. */
function entry(param: ParsedParameter): string {
  const name = jsLiteral(param.name);
  return param.type === "array" ? `form.getAll(${name})` : `form.get(${name}) ?? void 0`;
}
