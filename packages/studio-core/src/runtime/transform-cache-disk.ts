import { createHash } from "node:crypto";
import { lstatSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createLogger } from "@noverax/courier";
import { encodeTransformEntry } from "./encode-transform-entry";
import { errnoCode } from "./errno-code";
import { pruneTransformCache } from "./prune-transform-cache";
import { readTransformEntry } from "./read-transform-entry";
import { whyUntrusted } from "./why-untrusted";
import { writeTransformEntry } from "./write-transform-entry";

const log = createLogger("Studio");

/* Shared by every cache in this process, so two caches on one directory,
   such as Studio's and a build plugin's, neither prune it twice nor touch
   an entry twice. */
const prunedDirectories = new Set<string>();
const markedEntries = new Set<string>();

/** Transforms kept in a directory, one entry per module and module system. */
export interface TransformCacheDisk {
  /**
   * @param key - The module and its module system, as the memory cache keys it
   * @param digest - The digest of the input being transformed
   * @returns The code kept for exactly that input, or `null` on a miss
   */
  read(key: string, digest: string): string | null;
  /**
   * @param key - The module and its module system, as the memory cache keys it
   * @param digest - The digest of the input that was transformed
   * @param code - The code of a successful transform
   */
  write(key: string, digest: string, code: string): void;
}

/**
 * Keep transforms in `directory`, where the next process can read them.
 *
 * Each entry is named after the sha256 of its key and replaced atomically,
 * so a reader sees a whole entry or none. It is read only when it is a
 * regular file — on POSIX also not a symbolic link, owned by this user and
 * writable by no one else — and when its header names the same input and its
 * body the header's length and sha256. Anything else is a miss, and the
 * write that follows replaces it. The first hit on an entry in a process
 * marks it as used, so pruning spares it.
 *
 * The first write of each cache creates the directory with mode 0700; the
 * first write in the process prunes it. A failure is never fatal: a missing
 * entry is a quiet miss; any other read error is logged once and is a miss.
 * A directory removed while the process runs, as by clearing
 * `node_modules/.cache`, is created again at the next write. A rename refused
 * because the entry is held open skips that one write; any other write error
 * is logged once, naming the directory and the code, and stops this cache's
 * writes while reads go on.
 *
 * @param directory - Where entries are kept; see `findTransformCacheDirectory`
 * @returns The directory's reader and writer
 * @example
 * ```ts
 * const disk = createTransformCacheDisk("/app/node_modules/.cache/courier/transform");
 * const code = disk.read(key, digest) ?? transformAndKeep();
 * ```
 */
export function createTransformCacheDisk(directory: string): TransformCacheDisk {
  const root = resolve(directory);
  let readFailureLogged = false;
  let created = false;
  let writable = true;

  function entryPath(key: string): string {
    return join(root, `${createHash("sha256").update(key).digest("hex").slice(0, 40)}.js`);
  }

  /* A system error is named by its code; anything else is shown whole. */
  function warn(failure: string, outcome: string, error: unknown): void {
    const code = errnoCode(error);
    const message = `Transform cache: cannot ${failure} ${root} (${code ?? "unexpected error"}); ${outcome}`;
    log.warn(message, code === undefined ? error : undefined);
  }

  function stopWriting(error: unknown): void {
    writable = false;
    warn("write to", "this process keeps new transforms in memory only", error);
  }

  /* Throws the reason the directory cannot be created; returns false, having
     stopped writes, when what is there cannot be trusted. A recursive mkdir
     accepts a directory that already exists, whoever made it and whatever it
     is, so the result is judged, not assumed. */
  function create(): boolean {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const reason = whyUntrusted(lstatSync(root), "directory");
    if (reason !== null) {
      writable = false;
      log.warn(
        `Transform cache: ${root} is ${reason}; this process keeps new transforms in memory only`,
      );
      return false;
    }
    created = true;
    if (prunedDirectories.has(root)) return true;
    prunedDirectories.add(root);
    pruneTransformCache(root);
    return true;
  }

  function writeEntry(path: string, bytes: Buffer): void {
    if (!created && !create()) return;
    try {
      writeTransformEntry(path, bytes);
    } catch (error) {
      if (errnoCode(error) !== "ENOENT") throw error;
      /* The directory was removed after it was created: once more, whole. */
      if (create()) writeTransformEntry(path, bytes);
    }
  }

  return {
    read(key, digest) {
      const path = entryPath(key);
      try {
        const code = readTransformEntry(path, digest, !markedEntries.has(path));
        if (code !== null) markedEntries.add(path);
        return code;
      } catch (error) {
        if (readFailureLogged) log.debug(`Transform cache: cannot read ${path}`, error);
        else warn("read entries in", "such modules are transformed instead", error);
        readFailureLogged = true;
        return null;
      }
    },
    write(key, digest, code) {
      /* UTF-8 cannot carry a lone surrogate, which a string literal can pass
         from the source into the code; such code would come back altered, so
         it is kept in memory only. */
      if (!writable || !code.isWellFormed()) return;
      try {
        writeEntry(entryPath(key), encodeTransformEntry(digest, code));
      } catch (error) {
        stopWriting(error);
      }
    },
  };
}
