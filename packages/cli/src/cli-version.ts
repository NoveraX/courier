import { createRequire } from "node:module";

/**
 * The installed version of `@noverax/courier-cli`, read through the
 * package's own name so it resolves the same from source and from `lib/`.
 *
 * @returns The version in the package manifest
 * @example
 * ```ts
 * cliVersion(); // "0.3.0"
 * ```
 */
export function cliVersion(): string {
  const manifest: unknown = createRequire(import.meta.url)("@noverax/courier-cli/package.json");
  if (typeof manifest !== "object" || manifest === null || !("version" in manifest)) {
    throw new Error("@noverax/courier-cli/package.json has no version");
  }
  return String(manifest.version);
}
