import { loadEnv } from "vite";

import type { ViteEnvSettings } from "./vite-env-files";

/**
 * The variables Vite's env files give for a mode, with the values Vite gives
 * them — `${VAR}` and `${VAR:-default}` filled in as it fills them — for
 * each the process was not started with: what a reading of the routes puts
 * into `process.env` before the config runs, so it sees what the app sees.
 *
 * @param settings - Vite's root, mode and env folder
 * @returns The variables; none when the env folder is turned off
 * @example
 * ```ts
 * viteEnvValues({ root: "/app", mode: "production" }); // { API_URL: "https://api.example.com/v1" }
 * ```
 */
export function viteEnvValues({ root, mode, envDir }: ViteEnvSettings): Record<string, string> {
  if (envDir === false) return {};
  const loaded = loadEnv(mode, envDir ?? root, "");
  return Object.fromEntries(Object.entries(loaded).filter(([key]) => !(key in process.env)));
}
