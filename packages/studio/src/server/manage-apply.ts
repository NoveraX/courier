/**
 * Apply logic for manage routes — writes files to disk and updates state.
 */

import { unlinkSync } from "node:fs";
import { createLogger } from "@noverax/courier";
import type { ParsedSpec } from "../apis";
import type { AddResult, RemoveResult } from "../apis/manage/types";
import { resolveProjectSafe } from "../context";
import { errnoCode } from "./errno-code";
import { getImportState, type ImportsSnapshot } from "./imports-bridge";
import { persistManageApplyState } from "./manage-apply-state";
import { handleManagePreview } from "./manage-helpers";
import { writeFileWithDirs } from "./registry-helpers";

const log = createLogger("Studio");

interface ManageApplyRequest {
  name: string;
  spec: ParsedSpec;
  toAdd: Record<string, string[]>;
  toRemove: Record<string, string[]>;
}

/**
 * Add and remove endpoints of an import: write the files the preview changes,
 * delete the ones it drops, and record the result in the imports state.
 *
 * The preview is computed here, from the same declaration and state that are
 * then written and recorded, so the files and the state cannot disagree.
 *
 * @param body - The import's name, its spec, and the endpoints to add and remove by group
 * @param imports - The declarations of the config Studio runs, with the imports state
 * @returns How many files were written and deleted, or the error to answer with and its status
 *
 * @example
 * ```ts
 * await handleManageApply({ name: "pets", spec, toAdd: { pets: ["listPets"] }, toRemove: {} }, imports);
 * ```
 */
export async function handleManageApply(
  body: ManageApplyRequest,
  imports: ImportsSnapshot,
): Promise<
  { success: true; written: number; deleted: number } | { error: string; status: number }
> {
  const preview = handleManagePreview(body, imports);
  if ("error" in preview) return preview;

  const { addResult, removeResult } = preview;
  const written = writeAddedFiles(addResult) + writeModifiedFiles(removeResult);
  const deleted = deleteRemovedFiles(removeResult);

  await persistManageApplyState(body.name, body.spec, getImportState(imports, body.name), preview);
  return { success: true, written, deleted };
}

// ── File operations ──────────────────────────────────────────────────────────

function writeAddedFiles(addResult?: AddResult): number {
  if (!addResult) return 0;
  let count = 0;

  for (const file of addResult.files) {
    writeFileWithDirs(resolveProjectSafe(file.path), file.content);
    count++;
  }
  if (addResult.sourceFileUpdate) {
    writeFileWithDirs(
      resolveProjectSafe(addResult.sourceFileUpdate.path),
      addResult.sourceFileUpdate.content,
    );
    count++;
  }

  return count;
}

function writeModifiedFiles(removeResult?: RemoveResult): number {
  if (!removeResult) return 0;
  let count = 0;

  for (const file of removeResult.modifiedFiles) {
    writeFileWithDirs(resolveProjectSafe(file.path), file.content);
    count++;
  }
  if (removeResult.sourceFileUpdate) {
    writeFileWithDirs(
      resolveProjectSafe(removeResult.sourceFileUpdate.path),
      removeResult.sourceFileUpdate.content,
    );
    count++;
  }

  return count;
}

function deleteRemovedFiles(removeResult?: RemoveResult): number {
  if (!removeResult) return 0;

  for (const filePath of removeResult.deletedFiles) {
    try {
      unlinkSync(resolveProjectSafe(filePath));
    } catch (err) {
      /* A file already gone is what deleting it was for. */
      if (errnoCode(err) !== "ENOENT") log.warn(`Studio could not delete ${filePath}`, err);
    }
  }

  return removeResult.deletedFiles.length;
}
