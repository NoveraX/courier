/**
 * How one field of a form body is written, as OpenAPI's `encoding` object
 * names it for `application/x-www-form-urlencoded`.
 */
export interface FormFieldEncoding {
  /** `form` unless said otherwise */
  style?: "form" | "spaceDelimited" | "pipeDelimited" | "deepObject";
  /** `true` for `form`, the default style, unless said otherwise */
  explode?: boolean;
}

const DELIMITERS = { form: ",", spaceDelimited: " ", pipeDelimited: "|" } as const;

/**
 * Encode fields as an `application/x-www-form-urlencoded` body, each as its
 * encoding asks, with OpenAPI's defaults for the rest.
 *
 * A field left `undefined` is not sent, and a `null` one is sent empty. By
 * default an array repeats its field (`tag=a&tag=b`) and an object's
 * properties are fields of their own; without `explode` an array is one
 * delimited value (`tag=a,b`). `deepObject` writes an object's properties,
 * and its arrays' items, in brackets — `metadata[plan]=pro&items[0][price]=p_1`
 * — at any depth. A date is written as its ISO string.
 *
 * @param fields - The fields, by name
 * @param encoding - How each field is written, by name; OpenAPI's defaults for any not named
 * @returns The body, which `fetch` sends with its form content type
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
  const body = new URLSearchParams();
  for (const [name, value] of Object.entries(fields)) {
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
  if (value === undefined) return;
  if (Array.isArray(value)) {
    const items = value.filter((item) => item !== undefined).map(scalar);
    if (explode) for (const item of items) body.append(name, item);
    else body.append(name, items.join(DELIMITERS[style]));
    return;
  }
  if (!isObject(value)) {
    body.append(name, scalar(value));
    return;
  }
  const entries = Object.entries(value).filter(([, item]) => item !== undefined);
  if (!explode) {
    body.append(
      name,
      entries.flatMap(([key, item]) => [key, scalar(item)]).join(DELIMITERS[style]),
    );
    return;
  }
  for (const [key, item] of entries) appendDeep(body, key, item);
}

/* Brackets for every level below the field: `a[b][0][c]=v`. */
function appendDeep(body: URLSearchParams, name: string, value: unknown): void {
  if (value === undefined) return;
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) appendDeep(body, `${name}[${index}]`, item);
    return;
  }
  if (!isObject(value)) {
    body.append(name, scalar(value));
    return;
  }
  for (const [key, item] of Object.entries(value)) appendDeep(body, `${name}[${key}]`, item);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !(value instanceof Date);
}

function scalar(value: unknown): string {
  if (value === null) return "";
  if (value instanceof Date) return value.toISOString();
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
