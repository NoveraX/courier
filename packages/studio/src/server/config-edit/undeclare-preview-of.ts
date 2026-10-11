import { buildRemovalHunks } from "../mocks-edit/removal-hunks";
import { ConfigEditRefusal } from "./config-edit-refusal";
import type { UndeclarePreview } from "./config-undeclaration-types";
import type { PreparedUndeclaration } from "./prepare-config-undeclaration";

/**
 * What taking an import out of the config would do, as the remove dialog
 * shows it: each file the change writes with the lines it removes and the
 * lines around them, or why Studio leaves it to the developer.
 *
 * @param prepared - The prepared change; `null` when the config declares the import nowhere
 * @returns The preview; `null` when there is nothing to take out
 * @example
 * ```ts
 * undeclarePreviewOf(prepareConfigUndeclaration("pets", running, root, mayTake))?.status; // → "ready"
 * ```
 */
export function undeclarePreviewOf(
  prepared: PreparedUndeclaration | null,
): UndeclarePreview | null {
  if (prepared === null) return null;
  const { plan, configFile, baseHash } = prepared;
  if (plan instanceof ConfigEditRefusal) {
    return { status: "manual", code: plan.code, reason: plan.message };
  }
  return {
    status: "ready",
    configFile,
    files: plan.map((change) => ({
      file: change.file,
      hunks: buildRemovalHunks(change.text, change.planned, change.edits),
    })),
    baseHash,
  };
}
