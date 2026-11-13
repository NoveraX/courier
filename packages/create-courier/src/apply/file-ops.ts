import { randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  fchmodSync,
  fsyncSync,
  linkSync,
  openSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";

import { SetupFailure } from "./setup-failure";

/* The codes a file system without hard links answers link() with: a new file is then created as it is opened. */
const NO_HARD_LINKS: ReadonlySet<string> = new Set([
  "EPERM",
  "ENOTSUP",
  "EXDEV",
  "ENOSYS",
  "EOPNOTSUPP",
]);
/* Codes Windows answers a rename with while another program holds the file for a moment: an editor, an indexer, a scan. */
const HELD_ON_WINDOWS: ReadonlySet<string> = new Set(["EPERM", "EACCES", "EBUSY"]);
const RENAME_RETRY_MS: readonly number[] = [50, 100, 200, 400, 800];

/**
 * The code an error of the file system carries.
 *
 * @param error - What was thrown
 * @returns Its code, such as `ENOENT`, or `undefined`
 * @example
 * ```ts
 * if (errnoCode(error) === "EEXIST") skip();
 * ```
 */
export function errnoCode(error: unknown): string | undefined {
  return error instanceof Error && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

function deepestThere(path: string): string {
  let at = path;
  while (!existsSync(at) && dirname(at) !== at) at = dirname(at);
  return at;
}

/**
 * Where a path of the plan is on disk: inside the project, its links
 * followed — a file of the project's that links to one inside it is
 * written where it is. One that leads out of the project, by `..` or
 * through a link, is refused before anything is written there.
 *
 * @param root - The project's folder
 * @param path - The path, relative to the root, `/`-separated
 * @returns Where to read and write it
 * @throws {SetupFailure} `PATH_OUTSIDE_PROJECT` when it leads out of the project
 * @example
 * ```ts
 * projectPath("/work/shop", "src/courier/api.ts"); // "/work/shop/src/courier/api.ts"
 * ```
 */
export function projectPath(root: string, path: string): string {
  const realRoot = realpathSync(root);
  const there = deepestThere(join(root, path));
  const real = join(realpathSync(there), relative(there, join(root, path)));
  const inside = relative(realRoot, real);
  const out = inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside);
  if (path.split("/").includes("..") || out)
    throw new SetupFailure("PATH_OUTSIDE_PROJECT", `${path} leads out of the project, to ${real}`);
  return real;
}

/* Write content to a new file beside a path, flushed, with the mode given; opened exclusively, so nothing there is written through. */
function writeTempBeside(path: string, content: string | Buffer, mode?: number): string {
  const name = `.${basename(path)}.${process.pid}-${randomBytes(4).toString("hex")}.tmp`;
  const temp = join(dirname(path), name);
  const fd = openSync(temp, "wx");
  let written = false;
  try {
    writeFileSync(fd, content);
    if (mode !== undefined) fchmodSync(fd, mode);
    fsyncSync(fd);
    written = true;
  } finally {
    closeSync(fd);
    if (!written) unlinkSync(temp);
  }
  return temp;
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Create a file all at once, where nothing is: its content goes to a new
 * file beside it, which then takes its name by a hard link, so a crash
 * never leaves half of it, and a file that appeared there meanwhile is
 * never replaced. On a file system without hard links it is created as
 * it is opened, exclusively.
 *
 * @param path - Where, from {@link projectPath}
 * @param content - Its content
 * @throws {SetupFailure} `FILE_APPEARED` when something is there by now
 * @example
 * ```ts
 * createFileOnce(projectPath(root, "courier.config.ts"), text);
 * ```
 */
export function createFileOnce(path: string, content: string): void {
  const temp = writeTempBeside(path, content);
  try {
    linkSync(temp, path);
  } catch (error) {
    const code = errnoCode(error);
    if (code === "EEXIST") throw new SetupFailure("FILE_APPEARED", `${path} is there by now`);
    if (code === undefined || !NO_HARD_LINKS.has(code)) throw error;
    try {
      writeFileSync(path, content, { flag: "wx" });
    } catch (exclusive) {
      if (errnoCode(exclusive) === "EEXIST")
        throw new SetupFailure("FILE_APPEARED", `${path} is there by now`);
      throw exclusive;
    }
  } finally {
    unlinkSync(temp);
  }
}

/**
 * Replace a file's content all at once, keeping its mode: the content
 * goes to a new file beside it, which then takes its name, retried on
 * Windows while another program holds the file for a moment; a read-only
 * file, which Windows never lets a rename replace, is not waited for. A
 * reader sees the old content or the new, never part of either.
 *
 * @param path - The file, from {@link projectPath}
 * @param content - Its new content
 * @example
 * ```ts
 * replaceFile(projectPath(root, "vite.config.ts"), after);
 * ```
 */
export function replaceFile(path: string, content: string | Buffer): void {
  const mode = existsSync(path) ? statSync(path).mode & 0o7777 : undefined;
  const readOnly = mode !== undefined && (mode & 0o200) === 0;
  const temp = writeTempBeside(path, content, mode);
  for (const delay of [...(readOnly ? [] : RENAME_RETRY_MS), undefined]) {
    try {
      renameSync(temp, path);
      return;
    } catch (error) {
      const code = errnoCode(error);
      const held = process.platform === "win32" && code !== undefined && HELD_ON_WINDOWS.has(code);
      if (!held || delay === undefined) {
        unlinkSync(temp);
        throw error;
      }
      sleepSync(delay);
    }
  }
}
