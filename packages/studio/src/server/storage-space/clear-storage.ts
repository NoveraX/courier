import { pruneBackups } from "../import-files/prune-backups";
import type { StudioStores } from "../storage/studio-stores";
import { compactDb } from "./compact-db";
import type { StorageKind } from "./storage-kinds";

/** What a clear reaches: Studio's stores, the project, and the mocks' stores. */
export interface ClearDeps {
  stores: Pick<
    StudioStores,
    "requestLog" | "mockLog" | "playgroundHistory" | "sessions" | "view" | "storage" | "pins"
  >;
  root: string;
  resetMockStores: () => Promise<void>;
}

/* What clearing one kind does. A page that shows a saved session goes back
   to the live requests once the sessions are gone. */
async function clearKind(kind: StorageKind, { stores, root, resetMockStores }: ClearDeps) {
  switch (kind) {
    case "requests":
      stores.requestLog.forget(new Set());
      return stores.pins.retain(new Set());
    case "mockLogs":
      return stores.mockLog.forgetAll();
    case "playground":
      return stores.playgroundHistory.replace([]);
    case "sessions":
      stores.sessions.clear();
      return stores.view.showLive();
    case "mockStores":
      return resetMockStores();
    case "backups":
      return void pruneBackups(root, 0);
  }
}

/**
 * Clear what the Storage settings name, then compact the database, so the
 * disk gets back the room it took. Backups an undo still needs stay.
 *
 * @param kinds - What to clear
 * @param deps - What the clear reaches
 * @example
 * ```ts
 * await clearStorage(["requests", "mockLogs"], { stores, root, resetMockStores });
 * ```
 */
export async function clearStorage(kinds: readonly StorageKind[], deps: ClearDeps): Promise<void> {
  for (const kind of kinds) await clearKind(kind, deps);
  if (deps.stores.storage.persistent) compactDb(deps.stores.storage.db);
}
