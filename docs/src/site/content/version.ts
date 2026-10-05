import fs from "node:fs"
import path from "node:path"

/**
 * The version of `@noverax/courier` the docs describe: the core package's
 * own, read from its manifest when the site builds.
 *
 * @returns The version, as the manifest writes it
 * @example
 * ```ts
 * coreVersion() // "0.0.0"
 * ```
 */
export function coreVersion(): string {
  const manifest: unknown = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "../packages/core/package.json"), "utf8")
  )
  if (typeof manifest === "object" && manifest !== null && "version" in manifest) {
    return typeof manifest.version === "string" ? manifest.version : "0.0.0"
  }
  return "0.0.0"
}
