import { reviveWithoutPrototypeKeys } from "../utils/safe-json";
import { parseWireOptions, parseWireOptionsJson, type WireOptions } from "./wire-options";

/** What a proxy POST's body carries: the call's variables and its options. */
export interface Envelope {
  /** Named values, a list, a JSON scalar, or the caller's form fields. */
  variables: unknown;
  options: WireOptions | undefined;
}

/** The body, read into an envelope, or why it is refused with 400. */
export type ParsedEnvelope = { ok: true; envelope: Envelope } | { ok: false; reason: string };

/** The fields a JSON envelope may have; the endpoint's names travel in the URL. */
const ENVELOPE_KEYS: ReadonlySet<string> = new Set(["variables", "options"]);

/** The multipart field the client writes first, holding the call's options. */
const OPTIONS_FIELD = "_options";

/**
 * Read a JSON envelope, `{ variables, options }`.
 *
 * Any other field is refused rather than ignored: a body that names its
 * endpoint is a client of another protocol, and serving it anyway would run
 * a call nobody could see had been misread. A key that reaches
 * `Object.prototype` never makes it into the variables.
 *
 * @param bytes - The body, already bounded
 * @returns The envelope, or why it is refused
 *
 * @example
 * ```ts
 * parseJsonEnvelope(new TextEncoder().encode('{"variables":{"id":1}}'));
 * // → { ok: true, envelope: { variables: { id: 1 }, options: undefined } }
 * ```
 */
export function parseJsonEnvelope(bytes: Uint8Array<ArrayBuffer>): ParsedEnvelope {
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes), reviveWithoutPrototypeKeys);
  } catch {
    return { ok: false, reason: "Invalid JSON body" };
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, reason: "The body must be an object: { variables, options }" };
  }

  const unknown = Object.keys(body).filter((key) => !ENVELOPE_KEYS.has(key));
  if (unknown.length > 0) {
    return {
      ok: false,
      reason: `The body may hold variables and options only, not ${unknown.sort().join(", ")}. The endpoint is named in the URL: _s, _g, _m`,
    };
  }

  const fields = new Map(Object.entries(body));
  const accepted = parseWireOptions(fields.get("options"));
  if (!accepted.ok) return accepted;
  return { ok: true, envelope: { variables: fields.get("variables"), options: accepted.options } };
}

/**
 * Read a multipart envelope: the caller's form, and the options field the
 * client writes before it.
 *
 * Only the first `_options` field is the call's; a caller's own field of that
 * name, later in the form, reaches the upstream as the caller wrote it.
 *
 * @param form - The parsed form
 * @returns The envelope, with the caller's fields as its variables, or why
 *   it is refused
 *
 * @example
 * ```ts
 * parseFormEnvelope(form); // → { ok: true, envelope: { variables: FormData, options } }
 * ```
 */
export function parseFormEnvelope(form: FormData): ParsedEnvelope {
  const variables = new FormData();
  let options: FormDataEntryValue | undefined;
  for (const [key, value] of form.entries()) {
    if (key === OPTIONS_FIELD && options === undefined) options = value;
    else variables.append(key, value);
  }

  if (options !== undefined && typeof options !== "string") {
    return { ok: false, reason: "options must be a JSON string" };
  }
  const accepted = parseWireOptionsJson(options ?? null);
  if (!accepted.ok) return accepted;
  return { ok: true, envelope: { variables, options: accepted.options } };
}
