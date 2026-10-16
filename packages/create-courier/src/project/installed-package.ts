import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { isRecord } from "../is-record";

/* Yarn's Plug'n'Play keeps packages out of node_modules, where nothing on disk says which are there. */
const PNP = [".pnp.cjs", ".pnp.js"];

/**
 * The package.json of a package as Node finds it from a project: in the
 * node_modules of the project's folder or of a folder above it, as a
 * workspace's packages are hoisted.
 *
 * @param root - The project's folder
 * @param name - The package
 * @returns Where its package.json is, `"pnp"` where Yarn's Plug'n'Play holds the packages, or `undefined` where none is found
 * @example
 * ```ts
 * installedManifest("/work/shop/apps/web", "next"); // "/work/shop/node_modules/next/package.json" in a workspace
 * ```
 */
export function installedManifest(root: string, name: string): string | "pnp" | undefined {
  for (let dir = root; ; dir = dirname(dir)) {
    const manifest = join(dir, "node_modules", name, "package.json");
    if (existsSync(manifest)) return manifest;
    if (PNP.some((file) => existsSync(join(dir, file)))) return "pnp";
    if (dirname(dir) === dir) return undefined;
  }
}

/**
 * A package's version as installed for a project, as Node finds it.
 *
 * @param root - The project's folder
 * @param name - The package
 * @returns Its version, or `undefined` where it is not found or Plug'n'Play hides it
 * @example
 * ```ts
 * installedVersion("/work/shop", "next"); // "16.4.0"
 * ```
 */
export function installedVersion(root: string, name: string): string | undefined {
  const manifest = installedManifest(root, name);
  if (manifest === undefined || manifest === "pnp") return undefined;
  const parsed: unknown = JSON.parse(readFileSync(manifest, "utf8"));
  return isRecord(parsed) && typeof parsed.version === "string" ? parsed.version : undefined;
}
