import type { Stats } from "node:fs";

/** What a trusted path must be. */
export type TrustedKind = "file" | "directory";

/** How strictly a path is judged. */
export interface TrustOptions {
  /**
   * Accept a path its group or others may write. For a directory other tools
   * create under the user's umask, where only its owner decides what it holds.
   */
  allowSharedWrite?: boolean;
}

/* Write permission for the group and for others. */
const SHARED_WRITE = 0o022;

/**
 * Why a path cannot be trusted to hold only what this user put there, or
 * `null` when it can.
 *
 * A symbolic link can lead anywhere, and something of another kind is not
 * what the caller expects. On POSIX, a path owned by another user, or one the
 * group or others may write, lets someone else place code that this process
 * would then run. Windows has no owner or mode bits of that kind, so only
 * the first two rules apply there.
 *
 * @param stats - The `lstat` of the path, or the `fstat` of a descriptor opened on it
 * @param kind - What the path should be
 * @param options - Whether write permission for the group and others is accepted (default: no)
 * @returns The reason, worded to follow "is", or `null`
 * @example
 * ```ts
 * const reason = whyUntrusted(lstatSync(nodeModules), "directory");
 * if (reason !== null) log.debug(`${nodeModules} is ${reason}`);
 * ```
 */
export function whyUntrusted(
  stats: Stats,
  kind: TrustedKind,
  { allowSharedWrite = false }: TrustOptions = {},
): string | null {
  if (stats.isSymbolicLink()) return "a symbolic link";
  const isKind = kind === "file" ? stats.isFile() : stats.isDirectory();
  if (!isKind) return `not a ${kind}`;
  const uid = process.getuid?.();
  if (uid === undefined) return null;
  if (stats.uid !== uid) return `owned by uid ${stats.uid}, not ${uid}`;
  if (!allowSharedWrite && (stats.mode & SHARED_WRITE) !== 0)
    return "writable by its group or others";
  return null;
}
