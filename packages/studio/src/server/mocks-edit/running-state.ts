import { relative, sep } from "node:path";
import type { LoadedCourierConfig } from "../config-loader";
import { describeError } from "../describe-error";
import type { ProjectSnapshot } from "../project-state/types";
import { MocksEditRefusal } from "./mocks-edit-refusal";

/** What Studio runs now, and why its latest load failed. */
export type LoadState = Pick<ProjectSnapshot, "running" | "failure">;

/**
 * The config and mocks Studio runs, when an edit can be planned against
 * them: the config loads, and the mocks file, if any, loads too.
 *
 * A config that is missing is told apart from one that does not load, even
 * while Studio still runs the version it loaded before.
 *
 * @param state - What Studio runs, and why its latest load failed
 * @param root - The project root, symlinks resolved, for messages
 * @returns What Studio runs
 * @throws MocksEditRefusal NO_CONFIG, CONFIG_LOAD_FAILING or MOCKS_LOAD_FAILING
 *
 * @example
 * ```ts
 * const loaded = runningState(project.snapshot(), root);
 * ```
 */
export function runningState({ running, failure }: LoadState, root: string): LoadedCourierConfig {
  if (failure?.code === "CONFIG_NOT_FOUND") throw noConfig();
  if (failure) {
    throw new MocksEditRefusal(
      "CONFIG_LOAD_FAILING",
      `courier.config does not load right now (${failure.message}). Fix that first; Studio adds mocks only beside a config it can load.`,
    );
  }
  if (!running) throw noConfig();
  if (running.mocks.error !== null) {
    const name = relativeName(running.mocks.file, root);
    throw new MocksEditRefusal(
      "MOCKS_LOAD_FAILING",
      `${name} does not load right now (${describeError(running.mocks.error, root)}). Fix that first.`,
    );
  }
  return running;
}

function noConfig(): MocksEditRefusal {
  return new MocksEditRefusal(
    "NO_CONFIG",
    "There is no courier.config in the project. Declare your sources there first.",
  );
}

function relativeName(file: string | null, root: string): string {
  return file ? relative(root, file).split(sep).join("/") : "courier.mocks.ts";
}
