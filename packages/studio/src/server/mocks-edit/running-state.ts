import { relative, sep } from "node:path";
import type { LoadedCourierConfig } from "../config-loader";
import { describeError } from "./describe-error";
import { MocksEditRefusal } from "./mocks-edit-refusal";

/** What Studio runs now, as the watcher reports it. */
export interface LoadState {
  current: LoadedCourierConfig | null;
  lastLoadError: unknown;
}

/**
 * The config and mocks Studio runs, when an edit can be planned against
 * them: the config loads, and the mocks file, if any, loads too.
 *
 * @param state - What the watcher reports
 * @param root - The project root, symlinks resolved, for messages
 * @returns What Studio runs
 * @throws MocksEditRefusal CONFIG_LOAD_FAILING, NO_CONFIG or MOCKS_LOAD_FAILING
 */
export function runningState(
  { current, lastLoadError }: LoadState,
  root: string,
): LoadedCourierConfig {
  if (lastLoadError !== null) {
    throw new MocksEditRefusal(
      "CONFIG_LOAD_FAILING",
      `courier.config does not load right now (${describeError(lastLoadError, root)}). Fix that first; Studio adds mocks only beside a config it can load.`,
    );
  }
  if (!current) {
    throw new MocksEditRefusal(
      "NO_CONFIG",
      "There is no courier.config yet. Declare your sources there first.",
    );
  }
  if (current.mocks.error !== null) {
    const name = relativeName(current.mocks.file, root);
    throw new MocksEditRefusal(
      "MOCKS_LOAD_FAILING",
      `${name} does not load right now (${describeError(current.mocks.error, root)}). Fix that first.`,
    );
  }
  return current;
}

function relativeName(file: string | null, root: string): string {
  return file ? relative(root, file).split(sep).join("/") : "courier.mocks.ts";
}
