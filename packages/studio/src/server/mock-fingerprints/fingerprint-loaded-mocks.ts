import { createLogger } from "@noverax/courier";
import { readWatchedBytes } from "../read-watched-bytes";
import { sha256Hex } from "../sha256-hex";
import { fingerprintMocks } from "./fingerprint-mocks";

const log = createLogger("Studio");

/**
 * The fingerprints of a mocks file a load evaluated, read from the same
 * bytes: the file is read again and fingerprinted only while it still holds
 * what was loaded. A file that changed since, or whose declarations Studio
 * cannot tell apart, gets none, and its next load counts every mock changed.
 *
 * @param file - The mocks file the load evaluated
 * @param contentHash - The sha256 of the bytes it evaluated; `null` when they changed while it ran
 * @returns The fingerprint of each key, or `undefined`
 * @example
 * ```ts
 * const fingerprints = fingerprintLoadedMocks(file, hashStillOnDisk(file, hashBefore));
 * ```
 */
export function fingerprintLoadedMocks(
  file: string,
  contentHash: string | null,
): ReadonlyMap<string, string> | undefined {
  if (contentHash === null) return undefined;
  /* The mocks loaded either way; without fingerprints they only restart
     more often than they need to. */
  try {
    const bytes = readWatchedBytes(file);
    if (bytes === null || sha256Hex(bytes) !== contentHash) return undefined;
    return fingerprintMocks(file, bytes.toString("utf8")) ?? undefined;
  } catch (error) {
    log.warn(`Could not tell the mocks of ${file} apart; each edit restarts every one`, error);
    return undefined;
  }
}
