import { relative, sep } from "node:path";
import { createLogger } from "@noverax/courier";
import type { ExclusiveContext } from "../exclusive-reload";
import { insertedLines } from "./inserted-lines";
import { MocksFileChangedError } from "./mocks-file-changed-error";
import { buildMocksSnippet } from "./plan/mocks-snippet";
import type { PreparedEdit } from "./prepare-edit";
import { removeCreatedMocksFile } from "./remove-created-mocks-file";
import { replaceMocksFile } from "./replace-mocks-file";
import type { DeclareApplyResult } from "./types";

const log = createLogger("Studio");

/**
 * Take back an edit whose load was not the one intended.
 *
 * The file is restored only while it still holds exactly what Studio wrote,
 * which the write checks right before it renames. The developer may have
 * saved the file meanwhile, and their save must survive: then Studio names
 * the lines it added instead of restoring. Studio's running state was never
 * touched; when the file cannot be restored, it is reloaded after the edit,
 * because what is on disk is no longer what Studio runs.
 *
 * @param tx - The edit's hold on the reload chain
 * @param prepared - The edit that was written
 * @param reason - Why it is taken back
 * @param leftover - A temporary file the write could not remove, which is removed too
 * @returns What the wizard is told
 */
export function undoEdit(
  tx: ExclusiveContext,
  prepared: PreparedEdit,
  reason: string,
  leftover: string | null = null,
): DeclareApplyResult {
  const { target, plan } = prepared;
  const failure = restore(prepared);
  if (failure !== null) return notTakenBack(tx, prepared, reason, failure);
  tx.acknowledge([target.path]);
  const kept = leftover ? discardLeftover(leftover, prepared) : null;
  log.warn(`Studio took back its edit of ${target.relative}: ${reason}`);
  const told = kept ? `${reason}. ${kept}` : reason;
  return {
    status: "rolledBack",
    target: target.relative,
    creates: plan.creates,
    reason: told,
    snippet: buildMocksSnippet(prepared.input),
  };
}

function restore({ target, planDigest }: PreparedEdit): unknown | null {
  try {
    if (target.kind === "existing") {
      replaceMocksFile(target.path, target.bytes, { mode: target.mode, expectedHash: planDigest });
    } else {
      removeCreatedMocksFile(target.path, planDigest);
    }
    return null;
  } catch (err) {
    return err;
  }
}

function notTakenBack(
  tx: ExclusiveContext,
  prepared: PreparedEdit,
  reason: string,
  err: unknown,
): DeclareApplyResult {
  const { target, plan } = prepared;
  tx.reloadAfter([target.path]);
  const lines = insertedLines(plan.text, plan.edits);
  if (err instanceof MocksFileChangedError) {
    return { status: "notVerified", target: target.relative, reason, insertedLines: lines };
  }
  log.error(`Studio could not take back its edit of ${target.relative}`, err);
  return { status: "rollbackFailed", target: target.relative, reason, insertedLines: lines };
}

/* The temporary file a creation could not remove is a second name for the
   planned text; once the file it created is gone it is only clutter. */
function discardLeftover(path: string, { root, planDigest }: PreparedEdit): string | null {
  try {
    removeCreatedMocksFile(path, planDigest);
    return null;
  } catch (err) {
    log.warn(`Studio could not remove its temporary file ${path}`, err);
    return `Studio could not remove its temporary file ${relative(root, path).split(sep).join("/")}; delete it`;
  }
}
