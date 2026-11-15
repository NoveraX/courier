import { assertJsonValue, jsonValueOf } from "../utils/variables-encoding";

/**
 * How one field of a form body is written, as OpenAPI's `encoding` object
 * names it for `application/x-www-form-urlencoded`.
 */
export interface FormFieldEncoding {
  /** `form` unless said otherwise */
  style?: "form" | "spaceDelimited" | "pipeDelimited" | "deepObject" | undefined;
  /** `true` for `form`, the default style, unless said otherwise */
  explode?: boolean | undefined;
}

const DELIMITERS = { form: ",", spaceDelimited: " ", pipeDelimited: "|" } as const;

/* Why a file is refused where a url-encoded body would carry it. */
const FORM_HOLDS_TEXT = "a url-encoded body holds text; send a file in a FormData";

/**
 * Encode fields as an `application/x-www-form-urlencoded` body, each as its
 * encoding asks, with OpenAPI's defaults for the rest.
 *
 * A field left `undefined` is not sent, and a `null` one is sent empty. By
 * default an array repeats its field (`tag=a&tag=b`) and an object's
 * properties are fields of their own; without `explode` an array is one
 * delimited value (`tag=a,b`). `deepObject` writes an object's properties,
 * and its arrays' items, in brackets — `metadata[plan]=pro&items[0][price]=p_1`
 * — at any depth. Each value is written as JSON writes it inside the fields,
 * its `toJSON` asked first, so a direct call sends what a call through the
 * proxy does: a date is its ISO string, and a value JSON writes as `null` or
 * leaves out — `NaN`, a date that is no date, a function — is sent empty, as
 * `null` is. What JSON would lose — a file, a `Set`, a `Map`, a `BigInt`, a
 * value inside itself — is refused.
 *
 * @param fields - The fields, by name
 * @param encoding - How each field is written, by name; OpenAPI's defaults for any not named
 * @returns The body, which `fetch` sends with its form content type
 * @throws ConfigurationError `VARIABLE_NOT_ENCODABLE` for what JSON would lose, named by where it sits
 * @example
 * ```ts
 * const createCustomer = endpoint
 *   .variables<{ email: string; metadata?: Record<string, string> }>()
 *   .via((http, fields) =>
 *     http.post("customers", undefined, {
 *       body: formBody(fields, { metadata: { style: "deepObject", explode: true } }),
 *     }),
 *   );
 * // email=ada%40example.com&metadata%5Bplan%5D=pro
 * ```
 */
export function formBody(
  fields: Record<string, unknown>,
  encoding: Readonly<Record<string, FormFieldEncoding>> = {},
): URLSearchParams {
  assertJsonValue(fields, "fields", FORM_HOLDS_TEXT);
  const body = new URLSearchParams();
  for (const [name, field] of Object.entries(fields)) {
    const { style = "form", explode = style === "form" } = Object.hasOwn(encoding, name)
      ? (encoding[name] ?? {})
      : {};
    const value = jsonValueOf(field, name);
    if (style === "deepObject") appendDeep(body, name, value);
    else appendStyled(body, name, value, style, explode);
  }
  return body;
}

function appendStyled(
  body: URLSearchParams,
  name: string,
  value: unknown,
  style: keyof typeof DELIMITERS,
  explode: boolean,
): void {
  if (value === undefined) return;
  if (Array.isArray(value)) {
    const items = membersOf(value).flatMap(([, item]) => (item === undefined ? [] : textOf(item)));
    if (explode) for (const item of items) body.append(name, item);
    else body.append(name, items.join(DELIMITERS[style]));
    return;
  }
  if (!isObject(value)) {
    body.append(name, textOf(value));
    return;
  }
  const entries = membersOf(value).filter(([, item]) => item !== undefined);
  if (!explode) {
    body.append(
      name,
      entries.flatMap(([key, item]) => [key, textOf(item)]).join(DELIMITERS[style]),
    );
    return;
  }
  for (const [key, item] of entries) appendDeep(body, key, item);
}

/* Brackets for every level below the field: `a[b][0][c]=v`. */
function appendDeep(body: URLSearchParams, name: string, value: unknown): void {
  if (value === undefined) return;
  if (Array.isArray(value)) {
    for (const [index, item] of membersOf(value)) appendDeep(body, `${name}[${index}]`, item);
    return;
  }
  if (!isObject(value)) {
    body.append(name, textOf(value));
    return;
  }
  for (const [key, item] of membersOf(value)) appendDeep(body, `${name}[${key}]`, item);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/* A list's items or an object's fields, each as its toJSON gives it, with the key JSON asks it with. */
function membersOf(value: object): [string, unknown][] {
  const members: [string, unknown][] = Object.entries(value);
  return members.map(([key, item]) => [key, jsonValueOf(item, key)]);
}

/* A value as JSON writes it, its toJSON asked already: a string as it is, and what JSON writes as
   null or leaves out — null, NaN, a function — empty. */
function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  const json: string | undefined = JSON.stringify(value);
  return json === undefined || json === "null" ? "" : json;
}
