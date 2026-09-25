import { statSync } from "node:fs";
import { contentHashOf } from "./file-content-hash";

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
 * @param path - The file
 * @returns Its signature, carrying the hash of its bytes
 * @example
 * ```ts
 * if (signatureOf(path).key !== reportedAt.get(path)) report(path);
 * ```
 */
export function signatureOf(path: string): FileSignature {
  const stats = statSync(path, { throwIfNoEntry: false });
  if (!stats) return ABSENT;
  /* Gone between the stat and the read: its stat still tells a later
     change apart. */
  const contentHash = contentHashOf(path);
  return {
    key: `${stats.mtimeMs}:${stats.size}:${stats.ino}:${contentHash ?? "absent"}`,
    contentHash,
  };
}
