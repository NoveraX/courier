import { createRequire } from "node:module";

/**
 * The installed version of `@noverax/courier-studio`.
 *
 * Read through the package's own name rather than a relative path: the source
 * sits two directories below the manifest and the published chunks one, so a
 * relative lookup found the manifest in only one of them and every install
 * reported 0.0.0.
 *
 * @returns The version in the package manifest.
 */
export function studioVersion(): string {
  const manifest: unknown = createRequire(import.meta.url)("@noverax/courier-studio/package.json");
  if (typeof manifest !== "object" || manifest === null || !("version" in manifest)) {
    throw new Error("@noverax/courier-studio/package.json has no version");
  }
  return String(manifest.version);
}
