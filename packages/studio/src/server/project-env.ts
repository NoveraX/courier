import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** The files a project's variables are read from in development, the first to set one winning. */
const DEVELOPMENT_ENV_FILES = [".env.development.local", ".env.local", ".env.development", ".env"];

/** The `--dotenv` option of each command that reads `courier.config.ts`. */
export const DOTENV_ARG = {
  type: "string",
  valueHint: "files",
  description:
    "Env files to load before courier.config.ts, comma-separated, relative to the root (default: .env.development.local, .env.local, .env.development and .env, those there are)",
} as const;

/**
 * Load a project's variables before its config is read, as a framework's
 * development server does, so a source's `baseURL: process.env.API_URL`
 * reaches the same address in Studio as in the application: from the files
 * `--dotenv` names, or else from `.env.development.local`, `.env.local`,
 * `.env.development` and `.env` — those there are. A variable keeps the
 * first value it is given, and one the process was started with keeps its
 * own.
 *
 * @param root - The project's root
 * @param named - The files `--dotenv` names, comma-separated; absent, the development set
 * @returns The files loaded, as named
 * @throws {Error} When a file `--dotenv` names is not there
 * @example
 * ```ts
 * loadProjectEnv("/app"); // → [".env.local", ".env"]
 * loadProjectEnv("/app", ".env.staging");
 * ```
 */
export function loadProjectEnv(root: string, named?: string): string[] {
  const files =
    named === undefined
      ? DEVELOPMENT_ENV_FILES.filter((file) => existsSync(resolve(root, file)))
      : named
          .split(",")
          .map((file) => file.trim())
          .filter((file) => file !== "");
  for (const file of files) {
    const path = resolve(root, file);
    if (!existsSync(path)) throw new Error(`--dotenv ${file}: there is no file at ${path}`);
    process.loadEnvFile(path);
  }
  return files;
}
