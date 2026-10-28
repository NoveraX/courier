import { isAbsolute } from "node:path";
import type { TransformOptions, TransformResult } from "jiti";
import type { TransformCacheDisk } from "./transform-cache-disk";
import { createTransformCacheDisk } from "./transform-cache-disk";
import { transformDigest } from "./transform-digest";

/**
 * A store of jiti transforms: TypeScript and ESM sources compiled to the
 * CommonJS jiti evaluates, reused while the bytes and options that produced
 * them are unchanged.
 */
export interface TransformCache {
  /**
   * What jiti's transform yields for `options`: the kept code when the store
   * holds a successful transform of the same file from the same bytes and
   * options, and otherwise whatever `compute` returns.
   *
   * @param options - What jiti hands its transform
   * @param compute - jiti's own transform, run on a miss
   * @returns The result of `compute`, or its kept code, byte for byte
   */
  transform(
    options: TransformOptions,
    compute: (options: TransformOptions) => TransformResult,
  ): TransformResult;
}

/** Where a {@link TransformCache} keeps transforms, and how much in memory. */
export interface TransformCacheOptions {
  /**
   * A directory to keep transforms in across processes, as
   * `findTransformCacheDirectory` finds it. Without one, or with `null`,
   * transforms are kept in memory only.
   */
  directory?: string | null | undefined;
  /**
   * Characters of transformed code kept in memory across all files; the file
   * used least recently is dropped first once they are exceeded. `0` keeps
   * none, for a process that loads each module once. Defaults to 128 Mi
   * characters.
   */
  maxMemoryChars?: number | undefined;
  /**
   * Whether the `directory` is only read: nothing in it is created, written,
   * pruned or marked as used, so a transform computed on a miss stays in
   * this process. For a process that loads, once, what another process has
   * just kept there, as a mock worker loads the modules Studio loaded: its
   * own entries would only duplicate that process's. Defaults to `false`.
   */
  readOnly?: boolean | undefined;
}

interface MemoEntry {
  digest: string;
  code: string;
}

const DEFAULT_MAX_MEMORY_CHARS = 128 * 2 ** 20;

/* jiti turns a relative file name into `import.meta.url` against the working
   directory, which no digest captures, and a source with no file name has no
   entry to be kept under; both are transformed every time. */
function keyOf({ filename, async }: TransformOptions): string | null {
  if (filename === undefined || !isAbsolute(filename)) return null;
  return `${async === true}\0${filename}`;
}

/**
 * Create a {@link TransformCache} that keeps transforms in memory for the
 * life of the process and, given a `directory`, on disk for the next one.
 *
 * Each file holds one entry per module system — required and imported are
 * transformed differently, and a module reached both ways keeps both. An
 * entry is reused only when the digest of jiti's version, the options and
 * the source matches, so an edited file is transformed again the first time
 * it is loaded.
 *
 * A transform is looked for in memory, then in the directory, where a hit
 * is also kept in memory; only when both miss is it computed, and a success
 * is then kept in both. The directory is shared with every process that
 * names it, and a directory that cannot be read or written only costs
 * transforms; see `createTransformCacheDisk` for what an entry must be to be
 * used. A mock worker, which loads once the modules Studio has just loaded,
 * opens Studio's directory `readOnly` with `maxMemoryChars: 0`: it reads
 * what Studio kept, adds nothing to the directory, and holds nothing in
 * memory past its one load.
 *
 * A failed transform, one whose result carries an `error`, is never kept:
 * babel can fail on bytes it transforms without complaint a moment later,
 * such as a deeply nested module that overflows the stack while babel is
 * still cold. Such a file is transformed again on every load, and every
 * failure reaches jiti with its error, as it does without a cache. A file
 * named by a relative path, or not named, is transformed every time.
 *
 * @param options - The directory (default: none, memory only), the memory
 *   bound (default: 128 Mi characters), and whether the directory is only
 *   read (default: no)
 * @returns A cache to pass to `createConfigJiti` or `loadCourierConfig`
 * @example
 * ```ts
 * const transformCache = createTransformCache({
 *   directory: findTransformCacheDirectory(projectRoot),
 * });
 * const first = await loadCourierConfig({ cwd: projectRoot, transformCache });
 * // Unchanged modules are not transformed again, here or in the next process:
 * const second = await loadCourierConfig({ cwd: projectRoot, transformCache });
 *
 * // A process that loads once what another has just kept:
 * const reader = createTransformCache({ directory, readOnly: true, maxMemoryChars: 0 });
 * ```
 */
export function createTransformCache({
  directory,
  maxMemoryChars = DEFAULT_MAX_MEMORY_CHARS,
  readOnly = false,
}: TransformCacheOptions = {}): TransformCache {
  const disk: TransformCacheDisk | null = directory
    ? createTransformCacheDisk(directory, { readOnly })
    : null;
  const memo = new Map<string, MemoEntry>();
  let memoryChars = 0;

  function forget(key: string): void {
    const entry = memo.get(key);
    if (!entry) return;
    memo.delete(key);
    memoryChars -= entry.code.length;
  }

  /* A Map iterates in insertion order and a hit re-inserts its entry, so the
     first key is always the one used least recently. */
  function remember(key: string, entry: MemoEntry): void {
    forget(key);
    if (maxMemoryChars <= 0 || entry.code.length > maxMemoryChars) return;
    memo.set(key, entry);
    memoryChars += entry.code.length;
    for (const oldest of memo.keys()) {
      if (memoryChars <= maxMemoryChars) break;
      forget(oldest);
    }
  }

  return {
    transform(options, compute) {
      const key = keyOf(options);
      const digest = key === null ? null : transformDigest(options);
      if (key === null || digest === null) return compute(options);
      const hit = memo.get(key);
      if (hit?.digest === digest) {
        memo.delete(key);
        memo.set(key, hit);
        return { code: hit.code };
      }
      const kept = disk === null ? null : disk.read(key, digest);
      if (kept !== null) {
        remember(key, { digest, code: kept });
        return { code: kept };
      }
      const result = compute(options);
      if (result.error !== undefined) return result;
      remember(key, { digest, code: result.code });
      disk?.write(key, digest, result.code);
      return result;
    },
  };
}
