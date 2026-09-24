import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** Studio's working directory in a project: imports state and saved sessions. */
export const COURIER_DIR = ".courier";

/**
 * Make sure `.courier/` exists and keeps itself out of version control.
 *
 * The directory carries its own `.gitignore`, the way pytest and ruff caches
 * do, so Studio never edits the project's. It used to append to that file on
 * every start — also when started through the programmatic API — and a
 * mistyped project root crashed it.
 *
 * @param projectRoot - The project Studio serves.
 * @returns The directory's path.
 */
export function ensureCourierDir(projectRoot: string): string {
  const dir = resolve(projectRoot, COURIER_DIR);
  mkdirSync(dir, { recursive: true });
  const ignore = join(dir, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, "# Courier Studio working files\n*\n", "utf-8");
  return dir;
}
