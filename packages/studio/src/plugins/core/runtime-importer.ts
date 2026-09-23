import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { RUNTIME_SPECIFIER } from "./constants";

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
 * The runtime's entry file, resolved from this package, with forward slashes.
 *
 * For integrations whose snippet cannot say where to resolve from — a webpack
 * `data:` entry, a generated Nuxt plugin — so the snippet imports the file
 * itself instead of the package name.
 */
export function runtimeEntryPath(): string {
  return fileURLToPath(import.meta.resolve(RUNTIME_SPECIFIER)).replaceAll("\\", "/");
}
