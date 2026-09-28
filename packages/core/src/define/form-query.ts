import { type FormFieldEncoding, formBody } from "./form-body";

/**
 * Write fields as query values, each as its encoding asks, with OpenAPI's
 * defaults for the rest — the query string's counterpart of `formBody`.
 *
 * The client writes a query in OpenAPI's default style, `form` exploded: an
 * object's properties become names of their own, so Stripe's
 * `created: { gte }` went out as `gte=…`. Written by `formQuery` with the
 * parameter's `deepObject` style it goes out as `created[gte]=…`, and
 * `expand: ["tax"]` as `expand[0]=tax`. A field left `undefined` or `null`
 * is not sent, as the client leaves either out of a query.
 *
 * @param fields - The fields, by name; none when a call passes no variables
 * @param encoding - How each field is written, by name; OpenAPI's defaults for any not named
 * @returns The values by the names they are sent under, a repeated name's as a list; a call's variables, or its `searchParams`
 * @example
 * ```ts
 * const listCustomers = endpoint
 *   .variables<{ created?: { gte?: number }; expand?: string[] }>()
 *   .via((http, query) =>
 *     http.get("customers", formQuery(query, {
 *       created: { style: "deepObject", explode: true },
 *       expand: { style: "deepObject", explode: true },
 *     })),
 *   );
 * // customers?created%5Bgte%5D=1680000000&expand%5B0%5D=tax
 * ```
 */
export function formQuery(
  fields: object | undefined,
  encoding: Readonly<Record<string, FormFieldEncoding>> = {},
): Record<string, string | string[]> {
  const present = Object.entries(fields ?? {}).filter(
    ([, value]) => value !== undefined && value !== null,
  );
  const values: Record<string, string | string[]> = {};
  for (const [name, value] of formBody(Object.fromEntries(present), encoding)) {
    const earlier = Object.hasOwn(values, name) ? values[name] : undefined;
    if (earlier === undefined) values[name] = value;
    else values[name] = Array.isArray(earlier) ? [...earlier, value] : [earlier, value];
  }
  return values;
}
