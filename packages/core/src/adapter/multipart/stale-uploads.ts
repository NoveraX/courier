import { createLogger } from "../../logger";
import type { NodeDisk } from "./node-disk";

const log = createLogger("Proxy");

/* An upload's folder: courier-upload-<host>-<process>-<its start>-<six characters mkdtemp picks>. */
const OWNED = /^courier-upload-([A-Za-z0-9._]+)-(\d+)-(\d+)-[A-Za-z0-9]{6}$/;
/* The folders this process has looked through, each once. */
const SWEPT = new Set<string>();
/* How far apart two readings of one process's start can be: one that had its number started apart. */
const SAME_START_MS = 1000;

/**
 * The name an upload's folder starts with in this process: the host, the
 * process's number and when it started, so that a process after it can
 * tell a folder whose maker is gone from one still in use — on this host
 * alone, as another host or container sharing the folder counts its
 * processes apart. The start tells this process from one before it that
 * had its number, as the server of a container restarted in place has.
 *
 * @param disk - Node's file system
 * @returns The prefix, for `mkdtemp` to end
 * @example
 * ```ts
 * folderPrefix(disk); // → "courier-upload-web-1-4242-86400123-"
 * ```
 */
export function folderPrefix(disk: NodeDisk): string {
  return `courier-upload-${hostTag(disk.os.hostname())}-${globalThis.process.pid}-${processStart()}-`;
}

/**
 * Look once, in the background, for the upload folders a process on this
 * host left in `parent`: one stopped by a signal it did not handle, SIGTERM
 * or SIGINT, runs no exit handler, and one killed outright runs nothing.
 * Run as this process makes its first folder there.
 *
 * @param disk - Node's file system
 * @param parent - The folder uploads are kept in
 * @param olderThanMs - How old a folder must be to be taken for left: the body's timeout
 * @example
 * ```ts
 * sweepOnce(disk, directory, 300_000);
 * ```
 */
export function sweepOnce(disk: NodeDisk, parent: string, olderThanMs: number): void {
  if (SWEPT.has(parent)) return;
  SWEPT.add(parent);
  void sweepStaleUploads(disk, parent, olderThanMs).catch((error: unknown) => {
    log.debug(`The upload folders in ${parent} could not be looked through`, error);
  });
}

/**
 * Remove the upload folders in `parent` that a process of this host made
 * and left: its process is gone, and the folder is older than
 * `olderThanMs`. One with this process's number that a process before it
 * made, which started at another moment, is such a folder too. A folder of
 * this process, of another host, or with the number of another process
 * running now, stays: one that took the number of a process gone is not
 * told apart from it.
 *
 * @param disk - Node's file system
 * @param parent - The folder uploads are kept in
 * @param olderThanMs - How old a folder must be to be removed
 * @returns How many were removed
 * @example
 * ```ts
 * await sweepStaleUploads(disk, os.tmpdir(), 300_000); // → 2
 * ```
 */
export async function sweepStaleUploads(
  disk: NodeDisk,
  parent: string,
  olderThanMs: number,
): Promise<number> {
  const host = hostTag(disk.os.hostname());
  let removed = 0;
  for (const entry of await disk.fs.promises.readdir(parent, { withFileTypes: true })) {
    const owner = OWNED.exec(entry.name);
    if (!entry.isDirectory() || owner?.[1] !== host || isRunning(owner)) continue;
    if (await removeIfOld(disk, disk.path.join(parent, entry.name), olderThanMs)) removed += 1;
  }
  if (removed > 0)
    log.info(`Removed ${removed} upload folder(s) a stopped process left in ${parent}`);
  return removed;
}

async function removeIfOld(disk: NodeDisk, folder: string, olderThanMs: number): Promise<boolean> {
  try {
    const { mtimeMs } = await disk.fs.promises.stat(folder);
    if (Date.now() - mtimeMs < olderThanMs) return false;
    await disk.fs.promises.rm(folder, { recursive: true, force: true });
    return true;
  } catch (error) {
    log.debug(`An upload folder left at ${folder} could not be removed`, error);
    return false;
  }
}

/* Whether the process that made a folder is still there: this one, if it has this number and started
   when this one did, or another, if a process has its number now. */
function isRunning(owner: RegExpExecArray): boolean {
  const pid = Number(owner[2]);
  if (pid !== globalThis.process.pid) return isAlive(pid);
  return Math.abs(Number(owner[3]) - processStart()) < SAME_START_MS;
}

/* When this process started, in milliseconds of the system's monotonic clock: the same, give or take
   a moment, in each of its threads and in each copy of the package it runs, and not moved when the
   time of day is set. */
let started: number | undefined;
function processStart(): number {
  const node = globalThis.process;
  started ??= Math.round(Number(node.hrtime.bigint() / 1_000_000n) - node.uptime() * 1000);
  return started;
}

/* Whether a process is still there; one of another user's answers EPERM, and is. */
function isAlive(pid: number): boolean {
  try {
    globalThis.process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ESRCH"
    );
  }
}

/* The host's name as a folder's name holds it: no separator in it, and short. */
function hostTag(name: string): string {
  return name.replace(/[^A-Za-z0-9.]/g, "_").slice(0, 32) || "host";
}
