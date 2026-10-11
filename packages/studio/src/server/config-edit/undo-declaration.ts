import type { ExclusiveContext } from "../exclusive-context";
import type { ManualDeclaration } from "./config-declare-types";
import type { ConfigEditRefusalCode } from "./config-edit-refusal";
import { type FileChange, restoreFileChanges } from "./file-changes";
import type { PreparedDeclaration } from "./prepare-config-declaration";

/**
 * Put the files the declaration wrote back as they were, and say why, with
 * the lines to add by hand.
 *
 * @param tx - The edit, alone on the reload chain
 * @param prepared - The change that was written
 * @param written - The files it wrote
 * @param refusal - Which case it is, and why the change is taken back
 * @param root - The project root, for the messages
 * @returns The declaration, left to the developer
 * @example
 * ```ts
 * return undoDeclaration(tx, prepared, written, { code: "NOT_LOADED", why }, root);
 * ```
 */
export function undoDeclaration(
  tx: ExclusiveContext,
  prepared: PreparedDeclaration,
  written: readonly FileChange[],
  refusal: { code: ConfigEditRefusalCode; why: string },
  root: string,
): ManualDeclaration {
  const reason = restoreFileChanges(tx, written, refusal.why, root);
  return { status: "manual", code: refusal.code, reason, declaration: prepared.declaration };
}
