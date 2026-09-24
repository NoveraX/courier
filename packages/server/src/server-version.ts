import { createRequire } from "node:module";

/**
 * The installed version of `@noverax/courier-server`, read through the
 * package's own name so it resolves the same from source and from `lib/`.
 *
 * @returns The version in the package manifest.
 */
export function serverVersion(): string {
  const manifest: unknown = createRequire(import.meta.url)("@noverax/courier-server/package.json");
  if (typeof manifest !== "object" || manifest === null || !("version" in manifest)) {
    throw new Error("@noverax/courier-server/package.json has no version");
  }
  return String(manifest.version);
}
