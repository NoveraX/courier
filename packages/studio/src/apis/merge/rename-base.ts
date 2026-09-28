/**
 * Rename the base an endpoint is built from on its opening line, so an
 * endpoint generated against `endpoint` reads as the file it lands in
 * names its base — `api.endpoint`, a renamed destructuring, or the same.
 *
 * @param code - The endpoint's code, its name — bare or quoted — on the first line
 * @param from - The base the code was generated with
 * @param to - The base the file names
 * @returns The code with its base renamed
 * @example
 * ```ts
 * renameBase('    listPets: endpoint.get("")', "endpoint", "api.endpoint");
 * // → '    listPets: api.endpoint.get("")'
 * ```
 */
export function renameBase(code: string, from: string, to: string): string {
  if (from === to) return code;
  const base = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return code.replace(new RegExp(`(^\\s*(?:\\w+|"[^"]*"|'[^']*'):\\s*)${base}\\b`), `$1${to}`);
}

/**
 * Whether an endpoint's code is built from `base`: its value starts with it.
 *
 * @param code - The entry, `key: base.get(…)…`
 * @param base - A builder's name
 * @returns Whether the entry is built from it
 * @example
 * ```ts
 * usesBase('    events: stream.get("events")', "stream"); // → true
 * ```
 */
export function usesBase(code: string, base: string): boolean {
  const name = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*(?:\\w+|"[^"]*"|'[^']*'):\\s*${name}\\b`).test(code);
}
