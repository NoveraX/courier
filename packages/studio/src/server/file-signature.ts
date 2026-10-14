import { type Stats, statSync } from "node:fs";
import { createLogger } from "@noverax/courier";
import { errnoCode } from "@noverax/courier-cli/devkit";
import { contentHashOf, UNREADABLE } from "./file-content-hash";

const log = createLogger("Studio");

/** What a file holds, for telling a real edit from a repeated event. */
export interface FileSignature {
  /** Equal for two reads only when nothing about the file changed between them. */
  readonly key: string;
  /** The sha256 of its bytes, as `contentHashOf` reports it; `null` when absent. */
  readonly contentHash: string | null;
}

const ABSENT: FileSignature = { key: "absent", contentHash: null };

/**
 * Sign a file by its timestamp, size, inode and content. Absent files get a
 * distinct signature, so a deletion is reported once.
 *
 * The content counts, not only the timestamp and size: on filesystems with
 * coarse timestamps — Docker bind mounts, network shares, HFS+ — a second
 * save within the same second that kept the length (a renamed source, a
 * flipped flag) would otherwise look unchanged. The timestamp counts too, so
 * touching a file is still a change.
 *
 * A path that cannot be looked up — a link that loops, a directory above it
 * Studio may not search — is signed by the error, as unreadable, and never
 * throws: the watchers call this from their own callbacks, where a throw
 * would end the process, and one such path must not stop the others from
 * being compared.
 *
 * @param path - The file
 * @returns Its signature, carrying the hash of its bytes
 * @example
 * ```ts
 * if (signatureOf(path).key !== reportedAt.get(path)) report(path);
 * ```
 */
export function signatureOf(path: string): FileSignature {
  const stats = statOf(path);
  if (stats === null) return ABSENT;
  if (typeof stats === "string") return { key: `error:${stats}`, contentHash: UNREADABLE };
  /* Gone between the stat and the read: its stat still tells a later
     change apart. */
  const contentHash = contentHashOf(path);
  return {
    key: `${stats.mtimeMs}:${stats.size}:${stats.ino}:${contentHash ?? "absent"}`,
    contentHash,
  };
}

/* The stats of what is at the path, `null` when nothing is, or the code of
   the error that kept it from being looked up. */
function statOf(path: string): Stats | string | null {
  try {
    return statSync(path, { throwIfNoEntry: false }) ?? null;
  } catch (error) {
    log.debug(`Could not look up ${path} to sign it`, error);
    return errnoCode(error) ?? "UNKNOWN";
  }
}
