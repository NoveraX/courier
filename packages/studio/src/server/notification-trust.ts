/**
 * Which directories announce their saves with change notifications, so the
 * comparison pass may look at them rarely, as a safety net, and which do not,
 * so it must look every pass.
 *
 * A filesystem is taken at its word unless something says otherwise: on
 * Linux, its type, read with `statfs`, names one whose notifications miss
 * what another machine, a VM's host or Windows writes; anywhere, two saves
 * the comparison pass found that no notification announced. The judgment is
 * per filesystem, so the first misses on a share switch the whole share.
 * A directory no native watch could be armed on announces nothing either.
 */

import { type Stats, statfsSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { createLogger } from "@noverax/courier";

const log = createLogger("Studio");

/**
 * Linux filesystems whose notifications miss what is written from elsewhere,
 * by the `f_type` that `statfs` reports for them.
 */
const SILENT_FILESYSTEMS: ReadonlyMap<number, string> = new Map([
  [0x6969, "NFS"],
  [0x517b, "SMB"],
  [0xff534d42, "CIFS"],
  [0xfe534d42, "SMB2"],
  /* WSL's Windows drives, QEMU and other 9P shares */
  [0x01021997, "9P"],
  /* sshfs, rclone, virtiofs and other FUSE mounts */
  [0x65735546, "FUSE"],
  [0x786f4256, "VirtualBox shared folder"],
  [0x00c36400, "Ceph"],
  [0x5346414f, "AFS"],
  [0x73757245, "Coda"],
]);

/* Two misses, not one: a notification can be lost once, while the platform
   re-arms its watches, on a filesystem that announces every other save. */
const MISSES_TO_SILENCE = 2;

/** Which directories announce their saves. */
export interface NotificationTrust {
  /** Whether a save in this directory arrives as a change notification. */
  announces(directory: string): boolean;
  /** No native watch could be armed on this directory. */
  refused(directory: string): void;
  /**
   * The comparison pass found a save in this directory that no notification
   * announced. Returns `true` when its filesystem is taken as silent from now on.
   */
  missed(directory: string): boolean;
}

export interface NotificationTrustOptions {
  /** Take no directory at its word: `COURIER_WATCH_POLLING` is set. */
  pollEverywhere?: boolean;
  /** The platform, which decides whether a filesystem type is read at all. */
  platform?: NodeJS.Platform;
  /** The `f_type` of the filesystem a path is on. */
  filesystemType?: (path: string) => number;
}

/* The stats of a path, or nothing where it cannot be looked up. */
function statsOf(path: string): Stats | undefined {
  try {
    return statSync(path, { throwIfNoEntry: false });
  } catch (error) {
    log.debug(`Could not look up ${path} to tell its filesystem`, error);
    return undefined;
  }
}

/* The device a directory is on; one missing, or that cannot be looked up, is
   on its nearest ancestor's. */
function deviceOf(directory: string): { device: number; at: string } | null {
  for (let path = directory; ; path = dirname(path)) {
    const stats = statsOf(path);
    if (stats !== undefined) return { device: stats.dev, at: path };
    if (dirname(path) === path) return null;
  }
}

/**
 * Judge which directories announce their saves.
 *
 * @param options - Whether to trust none, and how to read a filesystem's type
 * @returns The judgment, kept for the life of the watch set
 * @example
 * ```ts
 * const trust = createNotificationTrust({ pollEverywhere: process.env.COURIER_WATCH_POLLING === "1" });
 * trust.announces("/app/src"); // true on a local disk
 * ```
 */
export function createNotificationTrust(options: NotificationTrustOptions = {}): NotificationTrust {
  const {
    pollEverywhere = false,
    platform = process.platform,
    filesystemType = (path) => statfsSync(path).type,
  } = options;
  const silent = new Map<number, boolean>();
  const misses = new Map<number, number>();
  const unwatched = new Set<string>();
  const devices = new Map<string, { device: number; at: string } | null>();

  /* Looked up once per directory: a directory does not change filesystems. */
  function located(directory: string): { device: number; at: string } | null {
    if (!devices.has(directory)) devices.set(directory, deviceOf(directory));
    return devices.get(directory) ?? null;
  }

  function kindOf(at: string): string | undefined {
    if (platform !== "linux") return undefined;
    try {
      return SILENT_FILESYSTEMS.get(filesystemType(at) >>> 0);
    } catch (error) {
      log.debug(`Could not read the filesystem type of ${at}`, error);
      return undefined;
    }
  }

  function isSilent(device: number, at: string): boolean {
    const known = silent.get(device);
    if (known !== undefined) return known;
    const kind = kindOf(at);
    if (kind !== undefined) {
      log.info(
        `Studio compares the files it watches on ${at} with the disk every half second: a ${kind} filesystem does not announce every save`,
      );
    }
    silent.set(device, kind !== undefined);
    return kind !== undefined;
  }

  return {
    announces(directory) {
      if (pollEverywhere || unwatched.has(directory)) return false;
      const found = located(directory);
      return found === null || !isSilent(found.device, found.at);
    },
    refused(directory) {
      unwatched.add(directory);
    },
    missed(directory) {
      const found = located(directory);
      if (found === null || silent.get(found.device) === true) return false;
      const count = (misses.get(found.device) ?? 0) + 1;
      misses.set(found.device, count);
      if (count < MISSES_TO_SILENCE) return false;
      silent.set(found.device, true);
      log.info(
        `Studio compares the files it watches on ${found.at} with the disk every half second: saves there arrive without a change notification`,
      );
      return true;
    },
  };
}
