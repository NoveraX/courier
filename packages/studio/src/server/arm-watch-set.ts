import { join } from "node:path";
import { CONFIG_BASENAMES, MOCKS_BASENAMES } from "@noverax/courier-studio-core/config";
import type { WatchSet } from "./watch-set";
import type { WatcherStatus } from "./watcher-status";

/** The watch set as each outcome of a load arms it. */
export interface WatchArming {
  /** A load succeeded: watch exactly what it read. */
  succeeded(deps: readonly string[]): void;
  /**
   * A load failed: keep watching what is watched. Before anything is, watch
   * every name the config or the mocks file may take in the root, so creating
   * or fixing either is picked up without a restart.
   */
  failed(): void;
}

/** Where the arming rules apply and who is told the count. */
export interface ArmWatchSetOptions {
  /** The project root, symlinks resolved. */
  projectRoot: string;
  /** Told how many paths are watched after each arming. */
  watcherStatus?: Pick<WatcherStatus, "setApiPathCount">;
}

/**
 * Arm a watch set from the outcome of each load.
 *
 * @param watchSet - The set to re-arm; nothing is watched until the first outcome
 * @param options - The project root and the watcher status
 * @returns What each outcome arms
 *
 * @example
 * ```ts
 * const arming = armWatchSet(watchSet, { projectRoot });
 * arming.succeeded(loaded.deps);
 * ```
 */
export function armWatchSet(
  watchSet: Pick<WatchSet, "update">,
  { projectRoot, watcherStatus }: ArmWatchSetOptions,
): WatchArming {
  let armed = false;

  function arm(paths: readonly string[]): void {
    watchSet.update(paths);
    armed = true;
    watcherStatus?.setApiPathCount(paths.length);
  }

  return {
    succeeded: arm,
    failed: () => {
      if (armed) return;
      arm([...CONFIG_BASENAMES, ...MOCKS_BASENAMES].map((name) => join(projectRoot, name)));
    },
  };
}
