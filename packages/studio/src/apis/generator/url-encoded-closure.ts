import type { ParsedEndpoint } from "../parser/types";
import { callOptions } from "./call-options";
import { destructuringClosure } from "./destructuring-closure";
import { encodingLiteral } from "./encoding-literal";
import { destructure } from "./variable-bindings";

/**
 * The closure of an endpoint that takes its fields url-encoded, as every
 * Stripe and Twilio write does: the path and query parameters are taken out
 * of the variables, and the rest are written as the body by `formBody`, each
 * field as the specification's `encoding` asks. Sent as JSON, they failed.
 *
 * @param ep - The endpoint
 * @param method - The verb, as the endpoint builder names it
 * @param at - The endpoint's path within its group, as a string literal
 * @param read - How the answer is read, as an options entry, when not as JSON
 * @param key - The key the fields are passed under when one of them shares a
 *   parameter's name, or `null` when they sit beside the parameters
 * @returns The closure's source
 * @example
 * ```ts
 * urlEncodedClosure(createCustomer, "post", '"customers"', null);
 * // '(http, { expand, ...body }) => http.post("customers", void 0,
 * //   { body: formBody(body, { metadata: { style: "deepObject", explode: true } }), searchParams: { expand } })'
 * ```
 */
export function urlEncodedClosure(
  ep: ParsedEndpoint,
  method: string,
  at: string,
  read: string | null,
  key: string | null = null,
): string {
  /* Under a key, the fields are apart from the path parameters already. */
  const { pattern, searchParams, ownCopy } = destructure(
    ep.parameters.filter((param) => param.in === "query"),
    key === null ? ep.parameters.filter((param) => param.in === "path") : [],
  );
  const encoding = ep.requestBodyEncoding ? `, ${encodingLiteral(ep.requestBodyEncoding)}` : "";
  const body = key ?? "...body";
  const bindings = pattern ? `${pattern}, ${body}` : body;
  const fields = key ?? "body";
  /* A body under its own key that the operation does not require may be absent. */
  const form = `formBody(${fields}${encoding})`;
  const sent = key !== null && ep.requestBodyOptional ? `${key} === void 0 ? null : ${form}` : form;
  const options = callOptions(`body: ${sent}`, searchParams, read);
  return destructuringClosure(bindings, `http.${method}(${at}, void 0, { ${options} })`, ownCopy);
}
