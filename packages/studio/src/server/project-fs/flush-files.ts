import { open } from "node:fs/promises";

/* Enough flushes at once to keep the disk busy, few enough to stay far from the open-file limit. */
const AT_ONCE = 16;

/* Windows flushes a file only through a handle that may write to it; a read-only one fails with EPERM. */
const FLUSH_FLAGS = process.platform === "win32" ? "r+" : "r";

async function flushFile(path: string): Promise<void> {
  const handle = await open(path, FLUSH_FLAGS);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/**
 * Flush files to disk, several at a time, off the thread that serves
 * requests: a flush waits on the disk, and hundreds of them one after the
 * other held Studio's whole server for seconds.
 *
 * @param paths - The files, each written and closed
 * @param tolerate - Takes a file that cannot be flushed, when that is not fatal; the error is thrown otherwise
 * @returns Once every file is on disk
 * @throws The file system's error for the first file that cannot be flushed, unless `tolerate` takes it
 * @example
 * ```ts
 * await flushFiles(staged.map((s) => s.temp));
 * ```
 */
export async function flushFiles(
  paths: Iterable<string>,
  tolerate?: (path: string, error: unknown) => void,
): Promise<void> {
  const all = [...paths];
  const flush = async (path: string): Promise<void> => {
    try {
      await flushFile(path);
    } catch (error) {
      if (tolerate === undefined) throw error;
      tolerate(path, error);
    }
  };
  for (let at = 0; at < all.length; at += AT_ONCE) {
    await Promise.all(all.slice(at, at + AT_ONCE).map(flush));
  }
}
