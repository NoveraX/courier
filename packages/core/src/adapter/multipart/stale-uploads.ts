import { createLogger } from "../../logger";
import type { NodeDisk } from "./node-disk";

const log = createLogger("Proxy");

/* An upload's folder: courier-upload-<host>-<process>-<six characters mkdtemp picks>. */
const OWNED = /^courier-upload-([A-Za-z0-9._]+)-(\d+)-[A-Za-z0-9]{6}$/;
/* The folders this process has looked through, each once. */
const SWEPT = new Set<string>();

/**
 * The name an upload's folder starts with in this process: the host and the
 * process that make it, so that a process after it can tell a folder whose
 * maker is gone from one still in use — on this host alone, as another
 * host or container sharing the folder counts its processes apart.
 *
 * @param disk - Node's file system
 * @returns The prefix, for `mkdtemp` to end
 * @example
 * ```ts
 * folderPrefix(disk); // → "courier-upload-web-1-4242-"
 * ```
 */
export function folderPrefix(disk: NodeDisk): string {
  return `courier-upload-${hostTag(disk.os.hostname())}-${process.pid}-`;
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
 * `olderThanMs`. A folder of a process still running, of another host, or
 * of this one, stays.
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
    const pid = Number(owner?.[2]);
    if (!entry.isDirectory() || owner?.[1] !== host || pid === process.pid || isAlive(pid))
      continue;
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

/* Whether a process is still there; one of another user's answers EPERM, and is. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
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
