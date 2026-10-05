import type { RequestEntry } from "@/store/types-request";

function asText(value: unknown, indent: number): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value, null, indent);
}

/**
 * A call's response as text to diff: the one received, a text as it
 * came — or, for a call that got no body, the error it ended with.
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
  if (typeof r.data === "string") return r.data;
  if (r.data !== undefined && r.data !== null) return asText(r.data, indent);
  return r.error ? asText(r.error, indent) : "";
}

/**
 * A call's variables as text to diff, as it passed them.
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
  return asText(r.variables, indent);
}
