import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RUNTIME_PACKAGE } from "./constants";

/**
 * A file inside this package, used as the importer when a bundler resolves the
 * runtime for the connect snippet.
 *
 * The runtime is a dependency of this package, not necessarily of the app: the
 * Vite, React and Vue setups install only `@noverax/courier-studio`. Resolved
 * from the app root, the import works only where the package manager happens
 * to hoist it, and fails under pnpm and Yarn Plug'n'Play.
 */
export const RUNTIME_IMPORTER: string = fileURLToPath(import.meta.url);

/** The directory of {@link RUNTIME_IMPORTER}, for bundlers that resolve from a directory. */
export const RUNTIME_IMPORTER_DIR: string = dirname(RUNTIME_IMPORTER);

/**
 * The runtime's browser entry file, resolved from this package, with forward
 * slashes.
 *
 * For integrations whose snippet cannot say where to resolve from — a webpack
 * `data:` entry, a generated Nuxt client plugin — so the snippet imports the
 * file itself instead of the package name. Every one of them runs in the
 * browser, so the file is the one the package's `browser` condition names:
 * resolving the package as Node does gave the server entry, which reaches
 * the config loader and Node's own modules.
 *
 * @returns The absolute path of the runtime's browser entry
 * @example
 * ```ts
 * runtimeEntryPath(); // → "/…/node_modules/@noverax/courier-studio-core/lib/runtime/browser.js"
 * ```
 */
export function runtimeEntryPath(): string {
  const manifestPath = fileURLToPath(import.meta.resolve(`${RUNTIME_PACKAGE}/package.json`));
  const entry = browserEntryOf(JSON.parse(readFileSync(manifestPath, "utf-8")));
  return join(dirname(manifestPath), entry).replaceAll("\\", "/");
}

function browserEntryOf(manifest: unknown): string {
  const runtime = field(field(manifest, "exports"), "./runtime");
  const browser = field(runtime, "browser");
  if (typeof browser !== "string") {
    throw new Error(`${RUNTIME_PACKAGE} names no browser entry for its runtime`);
  }
  return browser;
}

function field(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || !Object.hasOwn(value, key)) return undefined;
  return Reflect.get(value, key);
}
