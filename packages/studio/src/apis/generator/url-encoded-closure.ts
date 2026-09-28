import type { ParsedEndpoint } from "../parser/types";
import { callOptions } from "./call-options";
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
 * @returns The closure's source
 * @example
 * ```ts
 * urlEncodedClosure(createCustomer, "post", '"customers"', null);
 * // '(http, { expand, ...body }) => http.post("customers", undefined,
 * //   { body: formBody(body, { metadata: { style: "deepObject", explode: true } }), searchParams: { expand } })'
 * ```
 */
export function urlEncodedClosure(
  ep: ParsedEndpoint,
  method: string,
  at: string,
  read: string | null,
): string {
  const { pattern, searchParams } = destructure(
    ep.parameters.filter((param) => param.in === "query"),
    ep.parameters.filter((param) => param.in === "path"),
  );
  const encoding = ep.requestBodyEncoding ? `, ${encodingLiteral(ep.requestBodyEncoding)}` : "";
  const bindings = pattern ? `${pattern}, ...body` : "...body";
  const options = callOptions(`body: formBody(body${encoding})`, searchParams, read);
  return `(http, { ${bindings} }) => http.${method}(${at}, undefined, { ${options} })`;
}
