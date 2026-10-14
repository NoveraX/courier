import { statSync } from "node:fs";
import { errnoCode } from "@noverax/courier-cli/devkit";

/**
 * What a lookup found at a watched path, for telling one look from the next.
 * Kept as numbers and compared as numbers: a comparison pass makes no string.
 */
export interface WatchedState {
  mtimeMs: number;
  ctimeMs: number;
  size: number;
  ino: number;
  /** Why the path could not be looked up; `null` when it could. */
  error: string | null;
}

/**
 * Look a watched path up.
 *
 * A path that cannot be looked up — a link that loops, a directory Studio may
 * not search — is told apart by the error, and compared like any other.
 *
 * @param path - The path
 * @returns What is there, or `null` when nothing is
 * @example
 * ```ts
 * watchedState("/app/src/api.ts"); // → { mtimeMs: 1759590000123.4, ctimeMs: …, size: 412, ino: 8812, error: null }
 * ```
 */
export function watchedState(path: string): WatchedState | null {
  try {
    const stats = statSync(path, { throwIfNoEntry: false });
    if (stats === undefined) return null;
    const { mtimeMs, ctimeMs, size, ino } = stats;
    return { mtimeMs, ctimeMs, size, ino, error: null };
  } catch (error) {
    return { mtimeMs: 0, ctimeMs: 0, size: 0, ino: 0, error: errnoCode(error) ?? "UNKNOWN" };
  }
}
