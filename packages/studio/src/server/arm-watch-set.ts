import { join } from "node:path";
import { CONFIG_BASENAMES, MOCKS_BASENAMES } from "@noverax/courier-studio-core/config";
import type { LoadedCourierConfig } from "./config-loader";
import { ConfigNotFoundError } from "./config-loader-errors";
import { UNREADABLE } from "./file-content-hash";
import type { ProjectInputs } from "./read-project-inputs";
import type { WatchSet } from "./watch-set";
import type { WatcherStatus } from "./watcher-status";

/* No hash of any bytes equals it, so a path armed with it is reported at
   once and reloaded one more time. */
const RELOAD_ONCE = "changed while it loaded";

/** The watch set as each outcome of a load arms it. */
export interface WatchArming {
  /**
   * A load succeeded: watch exactly what it read, and report at once each
   * file whose bytes differ from the ones the load read.
   */
  succeeded(loaded: LoadedCourierConfig): void;
  /**
   * A load failed: keep watching what is watched, and add what the failed
   * load read — a module that threw, one it newly imports — and every name
   * the config or the mocks file may take in the root. A failed load never
   * shrinks the set, so restoring a module it could not find still reloads.
   *
   * @param inputs - What the failed load read before evaluating; `null` when
   *   it failed before reading anything
   * @param error - What it threw
   */
  failed(inputs: ProjectInputs | null, error: unknown): void;
}

/** Where the arming rules apply and who is told the count. */
export interface ArmWatchSetOptions {
  /** The project root, symlinks resolved. */
  projectRoot: string;
  /** Told how many paths are watched after each arming. */
  watcherStatus?: Pick<WatcherStatus, "setApiPathCount">;
}

/**
 * Arm a watch set from the outcome of each load, comparing each file the
 * load read with what it holds once it is watched, so a save that landed
 * while the load ran is reloaded — unless a second save restored the bytes
 * the load read before anything watched the file (see `startConfigWatcher`).
 *
 * @param watchSet - The set to re-arm; nothing is watched until the first outcome
 * @param options - The project root and the watcher status
 * @returns What each outcome arms
 *
 * @example
 * ```ts
 * const arming = armWatchSet(watchSet, { projectRoot });
 * arming.succeeded(loaded);
 * ```
 */
export function armWatchSet(
  watchSet: Pick<WatchSet, "update">,
  { projectRoot, watcherStatus }: ArmWatchSetOptions,
): WatchArming {
  let watched: readonly string[] = [];
  const configNames = CONFIG_BASENAMES.map((name) => join(projectRoot, name));
  const candidates = [...configNames, ...MOCKS_BASENAMES.map((name) => join(projectRoot, name))];

  function arm(paths: readonly string[], expected: ProjectInputs): void {
    watched = paths;
    watchSet.update(paths, expected);
    watcherStatus?.setApiPathCount(paths.length);
  }

  return {
    succeeded: (loaded) => arm(loaded.deps, expectedAfter(loaded)),
    failed: (inputs, error) => {
      const expected = new Map(inputs ?? []);
      /* No config was found under any name, so each was absent then. */
      if (error instanceof ConfigNotFoundError) {
        for (const name of configNames) expected.set(name, null);
      }
      arm([...new Set([...watched, ...expected.keys(), ...candidates])], expected);
    },
  };
}

/* An entry whose hash came out unknown was evaluated from bytes other than
   the ones the load read, which the file may hold again by now; nothing
   would then differ, so it is armed to reload once. Only one the load did
   read: a file that could not be read is not evaluated, and forcing it would
   reload for good. */
function expectedAfter(loaded: LoadedCourierConfig): ProjectInputs {
  const expected = new Map(loaded.depHashes);
  const unknown = [
    loaded.contentHash === null ? loaded.configFile : null,
    loaded.mocks.contentHash === null ? loaded.mocks.file : null,
  ];
  for (const file of unknown) {
    if (file !== null && wasRead(loaded.depHashes.get(file))) expected.set(file, RELOAD_ONCE);
  }
  return expected;
}

function wasRead(hash: string | null | undefined): boolean {
  return typeof hash === "string" && hash !== UNREADABLE;
}
