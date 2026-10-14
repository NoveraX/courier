import { lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { errnoCode } from "@noverax/courier-cli/devkit";
import { CourierDirUnsafeError } from "./courier-dir-unsafe-error";

/** Studio's working directory in a project: imports state and saved sessions. */
export const COURIER_DIR = ".courier";

/* `true` for a real folder, `false` for nothing there; anything else is refused. */
function isFolder(path: string, shown: string): boolean {
  try {
    const stats = lstatSync(path);
    if (stats.isSymbolicLink() || !stats.isDirectory()) throw new CourierDirUnsafeError(shown);
    return true;
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return false;
    throw error;
  }
}

/**
 * Make sure `.courier/` exists and keeps itself out of version control.
 *
 * The directory carries its own `.gitignore`, the way pytest and ruff caches
 * do, so Studio never edits the project's. A `.courier` that is a symbolic
 * link, or not a folder, is refused: it can arrive with a project, and
 * Studio writes nothing through it.
 *
 * @param projectRoot - The project Studio serves.
 * @returns The directory's path.
 * @throws {CourierDirUnsafeError} When `.courier` is a link or not a folder
 */
export function ensureCourierDir(projectRoot: string): string {
  const dir = resolve(projectRoot, COURIER_DIR);
  if (!isFolder(dir, COURIER_DIR)) mkdirSync(dir, { recursive: true });
  const ignore = join(dir, ".gitignore");
  try {
    writeFileSync(ignore, "# Courier Studio working files\n*\n", { encoding: "utf-8", flag: "wx" });
  } catch (error) {
    if (errnoCode(error) !== "EEXIST") throw error;
  }
  return dir;
}

/**
 * Make sure a folder Studio keeps in `.courier/` exists, as a real folder.
 *
 * @param projectRoot - The project Studio serves
 * @param name - The folder's name, such as `journal`
 * @returns The folder's path
 * @throws {CourierDirUnsafeError} When `.courier` or the folder is a link or not a folder
 * @example
 * ```ts
 * const journals = ensureCourierSubdir(root, "journal");
 * ```
 */
export function ensureCourierSubdir(projectRoot: string, name: string): string {
  /* Checked before anything is created, so a refusal leaves the project as it was. */
  const shown = `${COURIER_DIR}/${name}`;
  const courier = resolve(projectRoot, COURIER_DIR);
  if (isFolder(courier, COURIER_DIR)) isFolder(join(courier, name), shown);
  const dir = join(ensureCourierDir(projectRoot), name);
  if (!isFolder(dir, shown)) mkdirSync(dir);
  return dir;
}

/**
 * Tell whether a folder Studio keeps in `.courier/` is there, as a real
 * folder, without creating it.
 *
 * @param projectRoot - The project Studio serves
 * @param name - The folder's name, such as `backups`
 * @returns `true` when it is there; `false` when it is not
 * @throws {CourierDirUnsafeError} When `.courier` or the folder is a link or not a folder
 */
export function hasCourierSubdir(projectRoot: string, name: string): boolean {
  const courier = resolve(projectRoot, COURIER_DIR);
  return isFolder(courier, COURIER_DIR) && isFolder(join(courier, name), `${COURIER_DIR}/${name}`);
}
