import { relative, sep } from "node:path";
import type { ProjectSnapshot } from "./types";

/**
 * The `config:status` payload: how `courier.config` loads, told to the UI
 * after every outcome and on every connect.
 *
 * - `starting` — no load has had an outcome yet.
 * - `loaded` — the latest load succeeded; `configFile` is what Studio runs.
 * - `failed` — the latest load failed; Studio keeps running what it loaded at
 *   `lastGoodAt`, or nothing when that is `null`.
 * - `missing` — there is no config; as for `failed`, Studio keeps running
 *   what it loaded last.
 *
 * Paths are relative to the project root, with `/` separators.
 */
export type ConfigStatusPayload =
  | { state: "starting"; revision: 0 }
  | { state: "loaded"; revision: number; configFile: string; loadedAt: number }
  | {
      state: "failed";
      revision: number;
      configFile: string | null;
      error: { code: string; message: string };
      failedAt: number;
      lastGoodAt: number | null;
    }
  | { state: "missing"; revision: number; lastGoodAt: number | null };

const STARTING: ConfigStatusPayload = { state: "starting", revision: 0 };

/**
 * Tell how the config loads, from the project as Studio runs it.
 *
 * @param snapshot - The project as Studio runs it
 * @param root - The project root, symlinks resolved
 * @returns The payload of `config:status`
 *
 * @example
 * ```ts
 * configStatusOf(project.snapshot(), root);
 * // → { state: "loaded", revision: 1, configFile: "courier.config.ts", loadedAt: 1758790000000 }
 * ```
 */
export function configStatusOf(snapshot: ProjectSnapshot, root: string): ConfigStatusPayload {
  const { revision, running, loadedAt, failure } = snapshot;
  if (failure?.code === "CONFIG_NOT_FOUND") {
    return { state: "missing", revision, lastGoodAt: loadedAt };
  }
  if (failure) {
    return {
      state: "failed",
      revision,
      configFile: running ? relativeFile(root, running.configFile) : null,
      error: { code: failure.code, message: failure.message },
      failedAt: failure.at,
      lastGoodAt: loadedAt,
    };
  }
  /* Nothing runs and nothing failed only before the first outcome. */
  if (!running || loadedAt === null) return STARTING;
  return {
    state: "loaded",
    revision,
    configFile: relativeFile(root, running.configFile),
    loadedAt,
  };
}

function relativeFile(root: string, file: string): string {
  return relative(root, file).split(sep).join("/");
}
