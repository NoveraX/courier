import { readFileSync } from "node:fs";
import { dirname } from "node:path";

import type { ModuleCache } from "jiti";

import { type ConfigJitiOptions, createConfigJiti } from "./config-jiti";
import { projectFramework } from "./frameworks";
import { configLoadError, loadTimedOut } from "./load-error/explain-load-failure";
import { profileOf } from "./profiles/profile-of";

/** How one of the project's files is run, what runs just before its code does, and how long it may take. */
export interface ImportProjectFileOptions extends ConfigJitiOptions {
  /**
   * Called once the loader is made, just before the file's code runs. A
   * caller noting what that code reads starts here, so the loader's own
   * start-up is not taken for the file's.
   */
  beforeRun?: (() => void) | undefined;
  /**
   * How long the file may take to run before it is given up with
   * `ConfigLoadError` `LOAD_TIMED_OUT`, in milliseconds. Its code runs on —
   * nothing stops a module's top-level code — so a process that gives up
   * should end. Left out, it is waited for however long it takes.
   */
  timeoutMs?: number | undefined;
}

/**
 * Run one of the project's files — `courier.config.*`, `courier.mocks.*` —
 * with the project's loader, and hand back its module namespace. The
 * modules it runs go into a cache of this load's own, so a failure names the
 * chain of imports that led to it: the file runs as the loader's `import`
 * runs it, the loader choosing by its format whether to transform it or hand
 * it to Node.
 *
 * @param file - The file, absolute and symlink-resolved
 * @param options - How the loader resolves and transforms, what runs before the file, and how long it may take
 * @returns The file's module namespace
 * @throws ConfigLoadError saying why the file did not load, where, and what to do
 * @example
 * ```ts
 * const namespace = await importProjectFile("/app/courier.mocks.ts");
 * ```
 */
export async function importProjectFile(
  file: string,
  { beforeRun, timeoutMs, ...options }: ImportProjectFileOptions = {},
): Promise<unknown> {
  const { framework, manifest } = projectFramework(dirname(file));
  const profile = options.profile ?? profileOf(framework);
  const transformFailures = new Map<string, unknown>();
  const jiti = await createConfigJiti(file, {
    ...options,
    profile,
    onTransformError: (filename, error) => {
      transformFailures.set(filename, error);
      options.onTransformError?.(filename, error);
    },
  });
  beforeRun?.();
  const cache: ModuleCache = {};
  const load = { entry: file, cache, profile, manifest, transformFailures };
  const running = Promise.resolve(
    jiti.evalModule(readFileSync(file, "utf8"), { filename: file, async: true, cache }),
  ).catch((error: unknown) => {
    throw configLoadError(error, load);
  });
  if (timeoutMs === undefined) return running;
  return within(running, () => loadTimedOut(load, timeoutMs), timeoutMs);
}

/* What the file came to, or why not once its time is up; the timer lets the process end once the file has. */
function within<TValue>(
  running: Promise<TValue>,
  expired: () => Error,
  limitMs: number,
): Promise<TValue> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(expired()), limitMs);
  });
  return Promise.race([running, late]).finally(() => clearTimeout(timer));
}
