import { readdirSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { errnoCode } from "@noverax/courier-cli/devkit";
import { COURIER_DIR } from "../courier-dir";
import type { LifecycleCoordinator } from "../mock-manager";
import { mockStoreFile } from "../mock-store-file";

/** The mocks Studio runs, as far as resetting their stores goes. */
export type StoreMocks = Pick<LifecycleCoordinator, "summarizeServers" | "forwardStoreCommand">;

function storeFiles(folder: string): string[] {
  try {
    return readdirSync(folder).filter((name) => /\.sqlite(-wal|-shm|-journal)?$/.test(name));
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return [];
    throw error;
  }
}

/**
 * Empty the mocks' stores: a mock that runs resets its own, back to its
 * seeds, as its Reset store does; the store file of one that does not run,
 * or of one no longer declared, is deleted, and it starts from its seeds
 * when it starts again.
 *
 * @param root - The project Studio serves
 * @param mocks - The mocks Studio runs
 * @example
 * ```ts
 * await resetMockStores(root, mockManager);
 * ```
 */
export async function resetMockStores(root: string, mocks: StoreMocks): Promise<void> {
  const running = mocks.summarizeServers().filter((mock) => mock.alive);
  await Promise.all(
    running.map((mock) =>
      mocks.forwardStoreCommand({ action: "mock:server:reset", serverId: mock.key }),
    ),
  );
  const kept = new Set(running.map((mock) => basename(mockStoreFile(root, mock.key) ?? "")));
  const folder = join(root, COURIER_DIR, "mocks");
  for (const name of storeFiles(folder)) {
    if (!kept.has(name.replace(/-(wal|shm|journal)$/, "")))
      rmSync(join(folder, name), { force: true });
  }
}
