import type { TransformCache } from "@noverax/courier-studio-core/config";
import {
  createTransformCache,
  findTransformCacheDirectory,
} from "@noverax/courier-studio-core/config";

/* Keyed by the directory, so every root that shares a node_modules shares
   one memory bound and one disk layer. The roots with no directory share the
   entry under "": the memo is keyed by each module's absolute path and
   digest, so one project can never be handed another's transform, and one
   shared bound holds however many such roots a process loads. */
const caches = new Map<string, TransformCache>();

/**
 * The transform cache Studio loads a project's files through: one per
 * process for each directory transforms are kept in, created at its first
 * use.
 *
 * Every load of the config and its mocks file — the first, every reload,
 * and each one an edit makes — passes through it, so a module is
 * transformed once while its bytes stay the same, and a module kept on disk
 * by an earlier process is not transformed at all. The directory is looked
 * up again on each call, so a directory that turns untrusted, or appears,
 * is taken into account at the next load.
 *
 * @param projectRoot - The directory holding `courier.config.*`
 * @returns The cache for the directory `findTransformCacheDirectory` finds
 *   for the project, or the process's memory-only cache when it finds none
 * @example
 * ```ts
 * const loaded = await loadCourierConfig(projectRoot, {
 *   transformCache: studioTransformCache(projectRoot),
 * });
 * ```
 */
export function studioTransformCache(projectRoot: string): TransformCache {
  const directory = findTransformCacheDirectory(projectRoot);
  const key = directory ?? "";
  const existing = caches.get(key);
  if (existing) return existing;
  const created = createTransformCache({ directory });
  caches.set(key, created);
  return created;
}
