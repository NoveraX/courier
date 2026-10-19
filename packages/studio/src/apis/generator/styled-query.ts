/**
 * Query values an endpoint's closure writes with `formQuery`, for the
 * parameters a specification says are not written in OpenAPI's default
 * style: Stripe's `created[gte]` and `expand[0]` are `deepObject`, and a
 * Swagger 2.0 list is joined with commas.
 */

import { defineOwn } from "../define-own";
import type { FieldEncoding, ParsedEndpoint, ParsedParameter } from "../parser/types";
import { encodingLiteral } from "./encoding-literal";

/**
 * Whether any query parameter of an endpoint is written in a style of its own.
 *
 * @param ep - The endpoint
 * @returns Whether its closure writes the query with `formQuery`
 * @example
 * ```ts
 * hasStyledQuery(listCustomers); // → true, for `created` in deepObject style
 * ```
 */
export function hasStyledQuery(ep: ParsedEndpoint): boolean {
  return ep.parameters.some((param) => param.in === "query" && param.encoding !== undefined);
}

/**
 * The expression a closure passes as query values: the values as they are,
 * or written by `formQuery` when a parameter among them has a style of its own.
 *
 * @param values - The expression holding the values, `vars` or `{ expand }`
 * @param params - The parameters the values may hold
 * @returns The expression
 * @example
 * ```ts
 * styledQuery("{ expand }", [expand]);
 * // → 'formQuery({ expand }, { expand: { style: "deepObject", explode: true } })'
 * ```
 */
export function styledQuery(values: string, params: readonly ParsedParameter[]): string {
  const encoding: Record<string, FieldEncoding> = {};
  for (const param of params) {
    if (param.in === "query" && param.encoding) defineOwn(encoding, param.name, param.encoding);
  }
  if (Object.keys(encoding).length === 0) return values;
  return `formQuery(${values}, ${encodingLiteral(encoding)})`;
}
