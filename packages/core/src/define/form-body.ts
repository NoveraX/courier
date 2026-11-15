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
 * By default an array repeats its field (`tag=a&tag=b`) and an object's
 * properties are fields of their own; without `explode` an array is one
 * delimited value (`tag=a,b`). `deepObject` writes an object's properties,
 * and its arrays' items, in brackets — `metadata[plan]=pro&items[0][price]=p_1`
 * — at any depth. Each value is written as JSON writes it inside the fields,
 * its `toJSON` asked first, so a direct call sends what a call through the
 * proxy does: a date is its ISO string; what JSON leaves out of an object —
 * `undefined`, a function, a symbol — is not sent, the fields' own included,
 * and is sent empty as an item of a list, which JSON writes as `null`; and a
 * value JSON writes as `null` — `null`, `NaN`, a date that is no date — is
 * sent empty. What JSON would lose — a file, a `Set`, a `Map`, a `BigInt`, a
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
  return writeFields(fields, encoding, "empty");
}

/**
 * Write fields as `formBody` does, a field JSON writes as `null` sent empty
 * or not sent at all: `formQuery` leaves it out, as the client leaves one
 * out of a query.
 *
 * @param fields - The fields, by name
 * @param encoding - How each field is written, by name
 * @param nullField - What a field JSON writes as `null` becomes
 * @returns The fields' names and values, in order
 * @throws ConfigurationError `VARIABLE_NOT_ENCODABLE` for what JSON would lose, named by where it sits
 * @example
 * ```ts
 * writeFields({ page: 2, sort: null }, {}, "nothing").toString(); // "page=2"
 * ```
 */
export function writeFields(
  fields: object,
  encoding: Readonly<Record<string, FormFieldEncoding>>,
  nullField: "empty" | "nothing",
): URLSearchParams {
  assertJsonValue(fields, "fields", FORM_HOLDS_TEXT);
  const body = new URLSearchParams();
  for (const [name, value] of membersOf(fields)) {
    if (value === null && nullField === "nothing") continue;
    const { style = "form", explode = style === "form" } = Object.hasOwn(encoding, name)
      ? (encoding[name] ?? {})
      : {};
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
  if (Array.isArray(value)) {
    const items = membersOf(value).map(([, item]) => textOf(item));
    if (explode) for (const item of items) body.append(name, item);
    else body.append(name, items.join(DELIMITERS[style]));
    return;
  }
  if (!isObject(value)) {
    body.append(name, textOf(value));
    return;
  }
  const entries = membersOf(value);
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

/* A list's items or an object's fields as JSON writes them, with the key it asks each one's
   toJSON with: what it leaves out of an object is left out, and is null in a list, a hole too. */
function membersOf(value: object): [string, unknown][] {
  if (Array.isArray(value)) {
    return Array.from(value, (item: unknown, index): [string, unknown] => {
      const key = String(index);
      return [key, writtenOf(item, key) ?? null];
    });
  }
  const fields: [string, unknown][] = Object.entries(value);
  return fields.flatMap(([key, item]) => {
    const written = writtenOf(item, key);
    return written === undefined ? [] : [[key, written]];
  });
}

/* A value as JSON writes it, its toJSON asked first: `undefined` for what it leaves out — itself,
   a function, a symbol — and null for a number it has no text for. */
function writtenOf(value: unknown, key: string): unknown {
  const json = jsonValueOf(value, key);
  if (typeof json === "function" || typeof json === "symbol") return undefined;
  return typeof json === "number" && !Number.isFinite(json) ? null : json;
}

/* A value as JSON writes it, as text: a string as it is, null empty, any other its JSON. */
function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  return value === null ? "" : JSON.stringify(value);
}
