import { realpathSync } from "node:fs";
import type { LoadedCourierConfig } from "../config-loader";
import type { MocksTarget } from "./inspect-mocks-target";
import { MocksEditRefusal } from "./mocks-edit-refusal";

/**
 * Check that Studio runs the mocks file as it is on disk, so the diff shows
 * what the edit really does: the same file, with the same bytes, or none
 * when the edit creates one.
 *
 * @param loaded - What Studio runs
 * @param target - The file the edit writes, as inspected
 * @throws MocksEditRefusal MOCKS_CHANGED_SINCE_LOAD, which a reload clears
 */
export function checkLoadedState(loaded: LoadedCourierConfig, target: MocksTarget): void {
  const matches =
    target.kind === "existing"
      ? loaded.mocks.file === realpathSync(target.path) && loaded.mocks.contentHash === target.hash
      : loaded.mocks.file === null;
  if (matches) return;
  throw new MocksEditRefusal(
    "MOCKS_CHANGED_SINCE_LOAD",
    `${target.relative} changed since Studio loaded it. Studio plans the edit once it has reloaded.`,
  );
}
