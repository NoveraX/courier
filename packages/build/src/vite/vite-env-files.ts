import { join } from "node:path";

/** What of Vite's resolved config says where its env files are, and which. */
export interface ViteEnvSettings {
  readonly root: string;
  readonly mode: string;
  /** Where the env files are: the root when not set; `false` reads none. */
  readonly envDir?: string | false | undefined;
}

/**
 * The env files Vite reads for a mode, in the order the first to set a
 * variable wins: the mode's local file, the mode's, the local one, then
 * `.env` — the variables the app's own `import.meta.env` is given.
 *
 * @param settings - Vite's root, mode and env folder
 * @returns The files, absolute; none when the env folder is turned off
 * @example
 * ```ts
 * viteEnvFiles({ root: "/app", mode: "production" });
 * // → ["/app/.env.production.local", "/app/.env.production", "/app/.env.local", "/app/.env"]
 * ```
 */
export function viteEnvFiles({ root, mode, envDir }: ViteEnvSettings): string[] {
  if (envDir === false) return [];
  const dir = envDir ?? root;
  return [`.env.${mode}.local`, `.env.${mode}`, ".env.local", ".env"].map((name) =>
    join(dir, name),
  );
}
