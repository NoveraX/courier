/** The variable that switches the site's request inspector off: `off` does, anything else leaves it on. */
export const INSPECTOR_SWITCH = "DOCS_REQUEST_INSPECTOR"

/**
 * Whether the site's server tells the live examples' pages what it saw of
 * their calls — the site's own setting, on unless the deployment switches
 * it off, which no visitor's request changes.
 *
 * @param env - The environment
 * @returns Whether the inspector is on
 * @example
 * ```ts
 * requestInspection(process.env) // true, unless DOCS_REQUEST_INSPECTOR=off
 * ```
 */
export function requestInspection(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[INSPECTOR_SWITCH]?.trim().toLowerCase() !== "off"
}
