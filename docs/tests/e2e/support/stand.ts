/** The name the browsers open the site by: neither localhost nor any name on the internet. */
export const SITE_HOST = "courier.test"

/** Where the setup tells the workers what it started: the site's own address, and the front's key and certificate. */
export const STAND = {
  site: "COURIER_EXAMPLES_SITE",
  key: "COURIER_EXAMPLES_KEY",
  cert: "COURIER_EXAMPLES_CERT",
} as const

/**
 * A value the setup handed the workers.
 *
 * @param name - Its variable
 * @returns The value
 * @throws When the setup did not run, as when a spec is run without the config
 * @example
 * ```ts
 * const origin = fromSetup(STAND.site)
 * ```
 */
export function fromSetup(name: (typeof STAND)[keyof typeof STAND]): string {
  const value = process.env[name]
  if (value === undefined || value === "") {
    throw new Error(`${name} is unset: run the examples with npm run test:examples`)
  }
  return value
}

/**
 * The address the site sees a worker's visitor at, one of the documentation
 * range's, so that each worker is a caller of its own to the proxy's limits.
 *
 * @param index - The worker's index, or any number a test picks for a visitor of its own
 * @returns The address
 * @example
 * ```ts
 * visitorAddress(0) // "198.51.100.1"
 * ```
 */
export function visitorAddress(index: number): string {
  return `198.51.100.${(index % 254) + 1}`
}
