import { realpathSync } from "node:fs";
import { createLogger } from "@noverax/courier";
import { findMocksFile } from "@noverax/courier-studio-core/config";
import type { ExclusiveContext } from "../exclusive-context";
import { hashMocksFile } from "./hash-mocks-file";
import type { MocksEditContext } from "./mocks-edit-context";
import { prepareEdit } from "./prepare-edit";
import { readyOutcome } from "./ready-outcome";
import { restartingMocks } from "./restarting-mocks";
import { staleAfterSave } from "./stale-after-save";
import type { DeclareApplyResult } from "./types";
import type { DeclareBody } from "./validate-declare-body";
import { verifyAndApply } from "./verify-and-apply";
import { writePlanned } from "./write-planned";

const log = createLogger("Studio");

/**
 * The edit itself, holding the reload chain. The file must still be the one
 * the user previewed, and the plan made again against it must be the one
 * previewed; then it is written, loaded and checked.
 *
 * @param ctx - The running Studio, and the latest load's failure
 * @param tx - The edit's hold on the reload chain
 * @param body - The mocks, and the hashes of the confirmed preview
 * @returns What happened
 *
 * @example
 * ```ts
 * await ctx.project.runExclusive((tx) => editAlone(ctx, tx, body), CONFIG_LOAD_TIMEOUT_MS);
 * ```
 */
export async function editAlone(
  ctx: MocksEditContext,
  tx: ExclusiveContext,
  body: DeclareBody,
): Promise<DeclareApplyResult> {
  const root = realpathSync(ctx.projectRoot);
  if (mocksFileHash(root) !== body.baseHash) return staleAfterSave(ctx, tx, body.mocks);
  const state = { running: tx.current(), failure: ctx.project.snapshot().failure };
  const prepared = await prepareEdit(ctx, state, body.mocks);
  if (prepared.status !== "prepared") return prepared;
  if (prepared.planDigest !== body.planDigest)
    return { status: "stale", plan: await readyOutcome(ctx, prepared) };
  /* Read before the write, while the mocks it restarts still run. */
  const restarting = restartingMocks(ctx, prepared);
  const written = writePlanned(prepared);
  if (written === "changed") return staleAfterSave(ctx, tx, body.mocks);
  if ("status" in written) return written;
  /* Written synchronously just above, so no watcher callback has run yet. */
  tx.acknowledge([prepared.target.path]);
  return verifyAndApply(tx, prepared, written, restarting);
}

/* A file that became a link, something other than a file, or unreadable
   since the preview counts as changed, like a save: the fresh plan then says
   what is wrong with it. */
function mocksFileHash(root: string): string | null | "changed" {
  const found = findMocksFile(root);
  if (!found) return null;
  try {
    return hashMocksFile(found);
  } catch (err) {
    log.debug(`${found} could not be read to compare it with the preview`, err);
    return "changed";
  }
}
