import { parseJsonc } from "./jsonc-helpers";

/**
 * The headers a Playground run wrote that its proxy did not pass on to the
 * upstream.
 *
 * Only a proxy drops a caller's headers, and only the headers it reported
 * sending tell which: without that report nothing is claimed dropped. Names
 * compare without case, as HTTP compares them. A value that is not text is
 * left out — it was never sent as a header.
 *
 * @param sent - The Headers editor's text the run was sent with
 * @param forwarded - The headers the proxy reported sending upstream, when the call went through one
 * @returns The headers written but not sent upstream, by name
 * @example
 * ```ts
 * notForwardedOf('{ "x-trace": "abc", "accept": "text/csv" }', { Accept: "text/csv" }); // { "x-trace": "abc" }
 * notForwardedOf('{ "x-trace": "abc" }', undefined); // {}
 * ```
 */
export function notForwardedOf(
  sent: string,
  forwarded: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  if (!forwarded || sent.trim() === "") return {};
  const parsed = parseJsonc(sent);
  if (!parsed.ok || typeof parsed.value !== "object" || parsed.value === null) return {};
  if (Array.isArray(parsed.value)) return {};
  const passed = new Set(Object.keys(forwarded).map((name) => name.toLowerCase()));
  const written: Array<[string, unknown]> = Object.entries(parsed.value);
  const dropped: Record<string, string> = {};
  for (const [name, value] of written) {
    if (typeof value === "string" && !passed.has(name.toLowerCase())) dropped[name] = value;
  }
  return dropped;
}
