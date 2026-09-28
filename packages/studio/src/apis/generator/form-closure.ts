/**
 * The closure of an endpoint that takes a multipart form.
 */

import type { ParsedParameter } from "../parser/types";
import { callOptions } from "./call-options";
import { objectKey } from "./literals";

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
      ? `(http, form) => http.del(${at}, undefined, { ${callOptions("body: form", null, read)} })`
      : null;
  }
  const searchParams = `{ ${query.map((param) => `${objectKey(param.name)}: ${entry(param)}`).join(", ")} }`;
  const send =
    method === "del"
      ? `http.del(${at}, undefined, { ${callOptions("body", searchParams, read)} })`
      : `http.${method}(${at}, body, { ${callOptions(null, searchParams, read)} })`;
  /* The path's entries fill the path, and are not part of the body either. */
  const taken = JSON.stringify(params.map((param) => param.name));
  const copy = `const body = new FormData(); form.forEach((value, key) => { if (!${taken}.includes(key)) body.append(key, value); });`;
  return `(http, form) => { ${copy} return ${send}; }`;
}

/** A query parameter's value, read from the form: every entry of a list. */
function entry(param: ParsedParameter): string {
  const name = JSON.stringify(param.name);
  return param.type === "array" ? `form.getAll(${name})` : `form.get(${name}) ?? undefined`;
}
