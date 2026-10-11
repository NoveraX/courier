import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load `.env` files into the process before the project's config is read,
 * as `--dotenv` names them, relative to the project's root.
 *
 * @param root - The project's root
 * @param files - The files, in the order given
 * @throws {Error} When a file is not there
 * @example
 * ```ts
 * loadEnvFiles("/app", [".env.local"]);
 * ```
 */
export function loadEnvFiles(root: string, files: readonly string[] = []): void {
  for (const file of files) {
    const path = resolve(root, file);
    if (!existsSync(path)) throw new Error(`--dotenv ${file}: there is no file at ${path}`);
    process.loadEnvFile(path);
  }
}
