import { relative } from "node:path";
import { createLogger } from "@noverax/courier";

import type { ProjectEnv } from "@noverax/courier-cli/devkit";
import { createWatchSet, type WatchDegradation } from "./watch-set";

const log = createLogger("Studio");

/** The project's env files, watched beside its config. */
export interface EnvWatch {
  /**
   * Read the variables again when env files are among what changed, and
   * say which variables changed — by name only, as their values may be
   * secrets.
   *
   * @param changed - What changed
   * @returns Whether that leaves nothing to reload: only env files changed, and no variable did
   */
  settles(changed: readonly string[]): boolean;
  /** Compare the files with the disk now, as the config's watch set does. */
  sweep(until: number): Promise<boolean>;
  stop(): void;
}

/**
 * Watch a project's env files — those there are, and those that may be
 * made — as Studio watches its config: a change goes on the reload chain,
 * which reads the variables again before it reads the config again.
 *
 * @param project - The project's variables, if Studio reads them, and its root
 * @param onChange - Told the env files that changed
 * @param onDegraded - Told an env file is compared with the disk, not watched
 * @returns The watch, or nothing where Studio reads no variables
 * @example
 * ```ts
 * const envWatch = watchProjectEnv({ env, projectRoot }, queue.request, report);
 * ```
 */
export function watchProjectEnv(
  { env, projectRoot }: { env?: ProjectEnv | undefined; projectRoot: string },
  onChange: (changed: readonly string[]) => void,
  onDegraded: (degradation: WatchDegradation) => void,
): EnvWatch | undefined {
  if (env === undefined) return undefined;
  const files = new Set(env.files);
  const watchSet = createWatchSet({ paths: env.files, onChange, onDegraded });
  return {
    settles(changed) {
      const envFiles = changed.filter((path) => files.has(path));
      if (envFiles.length === 0) return false;
      const names = env.reread();
      if (names.length > 0) {
        const where = envFiles.map((file) => relative(projectRoot, file)).join(", ");
        log.info(`Variables read again from ${where}: ${names.join(", ")}`);
      }
      return names.length === 0 && envFiles.length === changed.length;
    },
    sweep: (until) => watchSet.sweep(until),
    stop: () => watchSet.stop(),
  };
}
