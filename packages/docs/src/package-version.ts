import { createRequire } from "node:module";

/**
 * The version this package is released at — that of the docs it holds —
 * read from its own manifest, beside the code as it is installed.
 *
 * @returns The version, or `0.0.0` from a manifest that names none
 * @example
 * ```ts
 * packageVersion(); // "0.4.0"
 * ```
 */
export function packageVersion(): string {
  const manifest: unknown = createRequire(import.meta.url)("../package.json");
  if (typeof manifest === "object" && manifest !== null && "version" in manifest) {
    if (typeof manifest.version === "string") return manifest.version;
  }
  return "0.0.0";
}
