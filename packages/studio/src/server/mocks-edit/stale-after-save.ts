import { realpathSync } from "node:fs";
import { createLogger } from "@noverax/courier";
import { findMocksFile } from "@noverax/courier-studio-core/config";
import type { LoadedCourierConfig } from "../config-loader";
import type { ConfigWatcher } from "../config-watcher";
import type { ExclusiveContext } from "../exclusive-reload";
import { hashMocksFile } from "./hash-mocks-file";
import type { MocksEditContext } from "./mocks-edit-context";
import { prepareEdit } from "./prepare-edit";
import { readyOutcome } from "./ready-outcome";
import type { DeclareApplyResult, MockDeclaration } from "./types";

const log = createLogger("Studio");

/**
 * The answer when the mocks file changed after the preview: the plan against
 * the file as it is now. Nothing is written.
 *
 * When Studio does not yet run the file as saved — the save is still on its
 * way through the watcher — it is loaded here and run as any save would be,
 * because the plan shown next must describe the file as it is. When Studio
 * already runs it, nothing is loaded again: that would restart every running
 * mock a second time for one save.
 *
 * @param ctx - The running Studio
 * @param watcher - The config watcher, for the last load's failure
 * @param tx - The edit's hold on the reload chain
 * @param requests - The mocks asked for
 * @returns A stale result carrying the new plan
 */
export async function staleAfterSave(
  ctx: MocksEditContext,
  watcher: ConfigWatcher,
  tx: ExclusiveContext,
  requests: readonly MockDeclaration[],
): Promise<DeclareApplyResult> {
  const root = realpathSync(ctx.projectRoot);
  const loadError = runsDisk(tx.current(), root) ? null : await reloadHere(tx);
  const state = { current: tx.current(), lastLoadError: loadError ?? watcher.lastLoadError() };
  const fresh = await prepareEdit(ctx, state, requests);
  return {
    status: "stale",
    plan: fresh.status === "prepared" ? await readyOutcome(ctx, fresh) : fresh,
  };
}

function runsDisk(current: LoadedCourierConfig | null, root: string): boolean {
  if (!current) return false;
  const found = findMocksFile(root);
  if (!found) return current.mocks.file === null;
  try {
    return (
      realpathSync(found) === current.mocks.file &&
      hashMocksFile(found) === current.mocks.contentHash
    );
  } catch (err) {
    log.debug(`${found} could not be compared with what Studio runs, so Studio loads it`, err);
    return false;
  }
}

async function reloadHere(tx: ExclusiveContext): Promise<unknown> {
  try {
    const loaded = await tx.load();
    tx.apply(loaded);
    acknowledgeIfUnchanged(tx, loaded.mocks.file, loaded.mocks.contentHash);
    return null;
  } catch (err) {
    return err;
  }
}

/* The save that made the plan stale is still on its way through the
   watcher; once loaded here it need not be loaded again — unless the file
   changed again while it loaded. */
function acknowledgeIfUnchanged(
  tx: ExclusiveContext,
  file: string | null,
  loadedHash: string | null,
): void {
  if (!file || !loadedHash) return;
  try {
    if (hashMocksFile(file) === loadedHash) tx.acknowledge([file]);
  } catch (err) {
    log.debug(`${file} changed again while Studio loaded it, so the watcher reloads it`, err);
  }
}
