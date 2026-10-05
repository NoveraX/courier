import { buildDiffHunks } from "../mocks-edit/diff-hunks";
import type { DeclarePreview } from "./config-declare-types";
import { ConfigEditRefusal } from "./config-edit-refusal";
import type { PreparedDeclaration } from "./prepare-config-declaration";

/**
 * What declaring the import would do, as the wizard shows it: the lines the
 * change adds with the lines around them, or why Studio leaves it to the
 * developer together with the lines to add by hand.
 *
 * @param prepared - The prepared change; `null` when the config declares the import already
 * @returns The preview
 * @example
 * ```ts
 * previewOf(prepareConfigDeclaration(body, loaded, root)).status; // → "ready"
 * ```
 */
export function previewOf(prepared: PreparedDeclaration | null): DeclarePreview {
  if (prepared === null) return { status: "declared" };
  const { plan, declaration, parts, text, baseHash } = prepared;
  if (plan instanceof ConfigEditRefusal) {
    return { status: "manual", code: plan.code, reason: plan.message, declaration };
  }
  return {
    status: "ready",
    configFile: parts.configFile,
    hunks: buildDiffHunks(text, plan.text, plan.edits),
    baseHash,
  };
}
