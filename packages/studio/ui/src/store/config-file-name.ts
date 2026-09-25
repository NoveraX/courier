import type { ConfigStatusPayload } from "./config-status";

/** What every config file's name starts with: said when no file is known. */
const CONFIG_NAME = "courier.config";

/**
 * The name to give the config a status is about: the file that loads, or
 * the file Studio ran before it was deleted. A failure is named
 * `courier.config` whatever file Studio runs: the file that failed may be
 * another one (a new `courier.config.mjs` beside a deleted `.ts`), and the
 * loader's message names it. So does a status that names no file.
 *
 * @param status - The config's status, or `null` when the UI has none
 * @returns A file relative to the project root, or `courier.config`
 *
 * @example
 * ```ts
 * configFileName({ state: "missing", revision: 3, configFile: "courier.config.mjs", lastGoodAt: 1 });
 * // → "courier.config.mjs"
 * configFileName({ state: "missing", revision: 1, configFile: null, lastGoodAt: null });
 * // → "courier.config"
 * ```
 */
export function configFileName(status: ConfigStatusPayload | null): string {
  if (status?.state === "loaded") return status.configFile;
  if (status?.state === "missing" && status.configFile !== null) return status.configFile;
  return CONFIG_NAME;
}
