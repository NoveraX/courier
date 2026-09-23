import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { createLogger } from "@noverax/courier";

const log = createLogger("Studio");

/**
 * What a file holds, for telling a real edit from a repeated event. Absent
 * files get a distinct signature so a deletion is reported once.
 *
 * The content counts, not only the timestamp and size: on filesystems with
 * coarse timestamps — Docker bind mounts, network shares, HFS+ — a second
 * save within the same second that kept the length (a renamed source, a
 * flipped flag) looked unchanged and was never reported. The watched files
 * are a config and the modules it imports, so reading them is cheap.
 */
export function signatureOf(path: string): string {
  const stats = statSync(path, { throwIfNoEntry: false });
  if (!stats) return "absent";
  let content: string;
  try {
    content = createHash("sha1").update(readFileSync(path)).digest("hex");
  } catch (error) {
    /* Gone or unreadable between the stat and the read: its stat still
       tells a later change apart. */
    log.debug(`Could not read ${path} to fingerprint it`, error);
    content = "unreadable";
  }
  return `${stats.mtimeMs}:${stats.size}:${stats.ino}:${content}`;
}
