import { createRequire } from "node:module";

/**
 * The installed version of `@noverax/courier-mcp`, read through the
 * package's own name so it resolves the same from source and from `lib/`.
 *
 * @returns The version in the package manifest
 * @example
 * ```ts
 * mcpVersion(); // "1.4.0"
 * ```
 */
export function mcpVersion(): string {
  const manifest: unknown = createRequire(import.meta.url)("@noverax/courier-mcp/package.json");
  if (typeof manifest !== "object" || manifest === null || !("version" in manifest)) {
    throw new Error("@noverax/courier-mcp/package.json has no version");
  }
  return String(manifest.version);
}
