import { isAbsolute } from "node:path";
import type { TransformOptions, TransformResult } from "jiti";
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

/** How much a {@link TransformCache} keeps. */
export interface TransformCacheOptions {
  /**
   * Characters of transformed code kept in memory across all files; the file
   * used least recently is dropped first once they are exceeded.
   * Defaults to 128 Mi characters.
   */
  maxMemoryChars?: number;
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
 * life of the process.
 *
 * Each file holds one entry per module system — required and imported are
 * transformed differently, and a module reached both ways keeps both. An
 * entry is reused only when the digest of jiti's version, the options and
 * the source matches, so an edited file is transformed again the first time
 * it is loaded.
 *
 * A failed transform, one whose result carries an `error`, is never kept:
 * babel can fail on bytes it transforms without complaint a moment later,
 * such as a deeply nested module that overflows the stack while babel is
 * still cold. Such a file is transformed again on every load, and every
 * failure reaches jiti with its error, as it does without a cache. A file
 * named by a relative path, or not named, is transformed every time.
 *
 * @param options - The memory bound (default: 128 Mi characters)
 * @returns A cache to pass to `createConfigJiti` or `loadCourierConfig`
 * @example
 * ```ts
 * const transformCache = createTransformCache();
 * const first = await loadCourierConfig({ cwd, transformCache });
 * // Unchanged modules are not transformed again:
 * const second = await loadCourierConfig({ cwd, transformCache });
 * ```
 */
export function createTransformCache({
  maxMemoryChars = DEFAULT_MAX_MEMORY_CHARS,
}: TransformCacheOptions = {}): TransformCache {
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
    if (entry.code.length > maxMemoryChars) return;
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
      const result = compute(options);
      if (result.error === undefined) remember(key, { digest, code: result.code });
      return result;
    },
  };
}
