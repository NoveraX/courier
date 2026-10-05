import type { RequestEntry } from "@/store/types-request";

function asText(value: unknown, indent: number): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value, null, indent);
}

/**
 * A call's response as text to diff: the validated response, else the
 * one received, else its raw text — or, for a call that got no body, the
 * error it ended with.
 *
 * @param r - The call
 * @param indent - The spaces JSON is indented with, as Studio's settings set
 * @returns The text
 * @example
 * ```ts
 * responseText(request, 2).split("\n");
 * ```
 */
export function responseText(r: RequestEntry, indent: number): string {
  const body = r.validatedResponse ?? r.data;
  if (body !== undefined && body !== null) return asText(body, indent);
  if (r.rawResponse) return r.rawResponse;
  return r.error ? asText(r.error, indent) : "";
}

/**
 * A call's variables as text to diff: the validated ones, else the ones
 * passed.
 *
 * @param r - The call
 * @param indent - The spaces JSON is indented with
 * @returns The text
 * @example
 * ```ts
 * variablesText(request, 2); // '{\n  "id": 7\n}'
 * ```
 */
export function variablesText(r: RequestEntry, indent: number): string {
  return asText(r.validatedVariables ?? r.variables, indent);
}
