import { buildRemovalHunks } from "../mocks-edit/removal-hunks";
import { ConfigEditRefusal } from "./config-edit-refusal";
import type { UndeclarePreview } from "./config-undeclaration-types";
import type { PreparedUndeclaration } from "./prepare-config-undeclaration";

/**
 * What taking an import out of the config would do, as the remove dialog
 * shows it: the lines the change removes with the lines around them, or why
 * Studio leaves it to the developer.
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
  const { plan, configFile, text, baseHash } = prepared;
  if (plan instanceof ConfigEditRefusal) {
    return { status: "manual", code: plan.code, reason: plan.message };
  }
  return {
    status: "ready",
    configFile,
    hunks: buildRemovalHunks(text, plan.text, plan.edits),
    baseHash,
  };
}
