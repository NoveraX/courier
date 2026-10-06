import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { createLogger } from "@noverax/courier";
import { isRecord } from "../mocks-edit/is-record";

const log = createLogger("Studio");

/** The files a Biome configuration is read from. */
export const BIOME_CONFIGS = ["biome.json", "biome.jsonc"];

/** The files a Prettier configuration is read from. */
export const PRETTIER_CONFIGS = [
  ".prettierrc",
  ".prettierrc.json",
  ".prettierrc.json5",
  ".prettierrc.yaml",
  ".prettierrc.yml",
  ".prettierrc.toml",
  ".prettierrc.js",
  ".prettierrc.cjs",
  ".prettierrc.mjs",
  ".prettierrc.ts",
  ".prettierrc.cts",
  ".prettierrc.mts",
  "prettier.config.js",
  "prettier.config.cjs",
  "prettier.config.mjs",
  "prettier.config.ts",
  "prettier.config.cts",
  "prettier.config.mts",
];

/** The files an ESLint configuration is read from: the flat ones, then the legacy ones. */
export const ESLINT_CONFIGS = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  "eslint.config.mts",
  "eslint.config.cts",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.yaml",
  ".eslintrc.yml",
  ".eslintrc.json",
  ".eslintrc",
];

/**
 * The first file of these names in a folder or one above it.
 *
 * @param from - The folder to start in
 * @param names - The names, the preferred first
 * @returns The file's path, or `null` when no folder up to the root has one
 * @example
 * ```ts
 * nearest("/app/packages/web", BIOME_CONFIGS); // "/app/biome.json"
 * ```
 */
export function nearest(from: string, names: readonly string[]): string | null {
  for (let dir = from; ; dir = dirname(dir)) {
    for (const name of names) {
      if (existsSync(join(dir, name))) return join(dir, name);
    }
    if (dirname(dir) === dir) return null;
  }
}

/**
 * The first `package.json` in a folder or one above it that has a key, as
 * Prettier and ESLint read their configuration from one.
 *
 * @param from - The folder to start in
 * @param key - The key: `prettier`, `eslintConfig`
 * @returns The manifest's path, or `null` when none has the key
 * @example
 * ```ts
 * manifestWith("/app", "prettier"); // "/app/package.json"
 * ```
 */
export function manifestWith(from: string, key: string): string | null {
  for (let dir = from; ; dir = dirname(dir)) {
    const manifest = readManifest(join(dir, "package.json"));
    if (manifest !== null && Object.hasOwn(manifest, key)) return join(dir, "package.json");
    if (dirname(dir) === dir) return null;
  }
}

/**
 * Whether a package's manifest lists a dependency, for development or not.
 *
 * @param manifest - The manifest, or `null` when there is none
 * @param name - The dependency
 * @returns Whether it is listed
 */
export function declares(manifest: Record<string, unknown> | null, name: string): boolean {
  if (manifest === null) return false;
  return ["dependencies", "devDependencies"].some((field) => {
    const deps = manifest[field];
    return isRecord(deps) && Object.hasOwn(deps, name);
  });
}

/**
 * A `package.json` read as an object.
 *
 * @param path - The manifest's path
 * @returns Its fields, or `null` when it is missing or not a JSON object
 */
export function readManifest(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    return isRecord(value) ? value : null;
  } catch (error) {
    log.debug(`${path} is not JSON`, error);
    return null;
  }
}

/**
 * What a set of files is now: each path with the time it last changed, so
 * a change to a configuration tells a warm formatter it reads an old one.
 *
 * @param paths - The files; one that is gone counts as such
 * @returns A string that differs whenever one of them changed
 */
export function filesStamp(paths: readonly string[]): string {
  return paths
    .map((path) => `${path}@${statSync(path, { throwIfNoEntry: false })?.mtimeMs ?? "gone"}`)
    .join("|");
}
