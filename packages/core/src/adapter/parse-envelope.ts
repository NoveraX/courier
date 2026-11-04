import { reviveWithoutPrototypeKeys } from "../utils/safe-json";
import { parseWireOptions, type WireOptions } from "./wire-options";

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

/**
 * Read a JSON envelope, `{ variables, options }`.
 *
 * Any other field is refused rather than ignored: a body that names its
 * endpoint is a client of another protocol, and serving it anyway would run
 * a call nobody could see had been misread. A key that reaches
 * `Object.prototype` never makes it into the variables.
 *
 * @param text - The body, already bounded and decoded
 * @returns The envelope, or why it is refused
 *
 * @example
 * ```ts
 * parseJsonEnvelope('{"variables":{"id":1}}');
 * // → { ok: true, envelope: { variables: { id: 1 }, options: undefined } }
 * ```
 */
export function parseJsonEnvelope(text: string): ParsedEnvelope {
  let body: unknown;
  try {
    body = JSON.parse(text, reviveWithoutPrototypeKeys);
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
