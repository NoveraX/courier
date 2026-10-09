import { createRequire } from "node:module";

/**
 * The installed version of `@noverax/create-courier`, read through the
 * package's own name so it resolves the same from source and from `lib/`.
 *
 * @returns The version in the package manifest
 * @example
 * ```ts
 * createCourierVersion(); // "1.4.0"
 * ```
 */
export function createCourierVersion(): string {
  const manifest: unknown = createRequire(import.meta.url)("@noverax/create-courier/package.json");
  if (typeof manifest !== "object" || manifest === null || !("version" in manifest)) {
    throw new Error("@noverax/create-courier/package.json has no version");
  }
  return String(manifest.version);
}
