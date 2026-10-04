/**
 * The variables of a proxy call made with GET — a plain read, or an SSE
 * subscription, which a browser can only open with GET.
 *
 * They travel as one JSON document in the `_v` query parameter, so a number
 * stays a number and a list stays a list, exactly as in a POST body. Spread
 * over separate query parameters, every value arrived as a string: a numeric
 * variable failed the endpoint's own schema, and an array or an object reached
 * the upstream as `[object Object]`.
 */

import { isFieldRecord } from "./body-kind";
import { isRecord } from "./is-record";
import { reviveWithoutPrototypeKeys } from "./safe-json";

/** Query parameter that carries the variables of a GET proxy call. */
export const WIRE_VARIABLES_KEY = "_v";

export type WireVariablesResult =
  | { ok: true; variables: Record<string, unknown> | undefined }
  | { ok: false; reason: string };

/**
 * Encode variables for the `_v` parameter.
 *
 * @param variables - The caller's variables
 * @returns The JSON document, or `undefined` when there is nothing to send
 *
 * @example
 * ```ts
 * encodeWireVariables({ ids: [1, 2] }); // → '{"ids":[1,2]}'
 * ```
 */
export function encodeWireVariables(variables: unknown): string | undefined {
  if (variables === undefined || variables === null) return undefined;
  /* A list or a scalar is sent as it is, for the server to refuse: encoded
     field by field, a list arrived as an object keyed "0", "1", … and the
     read went ahead with it. */
  if (!isFieldRecord(variables)) return JSON.stringify(variables);
  const present = Object.entries(variables).filter(([, value]) => value !== undefined);
  return present.length > 0 ? JSON.stringify(Object.fromEntries(present)) : undefined;
}

/**
 * Decode and check the `_v` parameter of a GET proxy request.
 *
 * @param raw - The raw parameter, or null when absent
 * @returns The variables, or the reason the request is refused
 *
 * @example
 * ```ts
 * parseWireVariables('{"page":2}'); // → { ok: true, variables: { page: 2 } }
 * parseWireVariables("[1]");        // → { ok: false, reason: … }
 * ```
 */
export function parseWireVariables(raw: string | null): WireVariablesResult {
  if (!raw) return { ok: true, variables: undefined };

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw, reviveWithoutPrototypeKeys);
  } catch {
    /* The reason travels back to the caller, so nothing is swallowed here. */
    return { ok: false, reason: "variables are not valid JSON" };
  }
  if (!isRecord(decoded)) return { ok: false, reason: "variables must be a JSON object" };
  return { ok: true, variables: decoded };
}
