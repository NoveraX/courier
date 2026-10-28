import type { Dirent } from "node:fs";
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readdirSync,
  readSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { createLogger } from "@noverax/courier";
import { TRANSFORM_ENTRY_FORMAT } from "./transform-entry-format";

const log = createLogger("Studio");

const HOUR_MS = 60 * 60 * 1000;
/* Each process that reads an entry touches it once, so one this old belongs
   to a module that was renamed, deleted or not loaded for a month. */
const ENTRY_MAX_AGE_MS = 30 * 24 * HOUR_MS;
/* A write lasts milliseconds; a temporary file this old was left by a
   writer that died before it could rename or remove it. */
const TEMPORARY_MAX_AGE_MS = HOUR_MS;

const READ_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
const PREFIX = Buffer.from(TRANSFORM_ENTRY_FORMAT.prefix, "latin1");

interface Expiry {
  maxAgeMs: number;
  /** What the file must start with to be deleted, or `null` for any content. */
  prefix: Buffer | null;
}

function expiryOf(name: string): Expiry | null {
  if (name.endsWith(".tmp")) return { maxAgeMs: TEMPORARY_MAX_AGE_MS, prefix: null };
  if (name.endsWith(".js")) return { maxAgeMs: ENTRY_MAX_AGE_MS, prefix: PREFIX };
  return null;
}

/* Judged through one descriptor that does not follow a link, so the age and
   the content measured are those of the file at that name, and a FIFO swapped
   in cannot block the open. */
function isExpired(path: string, { maxAgeMs, prefix }: Expiry, now: number): boolean {
  const fd = openSync(path, READ_FLAGS);
  try {
    const stats = fstatSync(fd);
    if (!stats.isFile() || now - stats.mtimeMs <= maxAgeMs) return false;
    if (prefix === null) return true;
    const start = Buffer.alloc(prefix.length);
    return readSync(fd, start, 0, prefix.length, 0) === prefix.length && start.equals(prefix);
  } finally {
    closeSync(fd);
  }
}

/**
 * Delete what a transform cache directory holds for nothing: entries not
 * read for 30 days, and temporary files a writer abandoned more than an hour
 * ago.
 *
 * Only regular files directly inside the directory are considered, and no
 * link is followed: a link, a subdirectory, or a `.js` file that does not
 * start like an entry is left alone, whatever its age. A file that cannot be
 * judged or deleted, such as one another process deleted first, is logged at
 * debug level and skipped.
 *
 * @param directory - The transform cache directory
 * @param now - The current time in milliseconds (default: `Date.now()`)
 * @example
 * ```ts
 * pruneTransformCache("/app/node_modules/.cache/courier/transform");
 * ```
 */
export function pruneTransformCache(directory: string, now: number = Date.now()): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    log.debug(`Transform cache: cannot list ${directory} to prune it`, error);
    return;
  }
  for (const entry of entries) {
    const expiry = entry.isFile() ? expiryOf(entry.name) : null;
    if (expiry === null) continue;
    const path = join(directory, entry.name);
    try {
      if (isExpired(path, expiry, now)) unlinkSync(path);
    } catch (error) {
      log.debug(`Transform cache: cannot prune ${path}`, error);
    }
  }
}
