import { createLogger } from "@noverax/courier";
import type { LoadedCourierMocks } from "./config-loader";
import { describeError } from "./describe-error";
import type { LifecycleCoordinator } from "./mock-manager";
import type { MockRegistry } from "./mock-registry";

const log = createLogger("Studio");

/** Where the mocks a load produced go. */
export interface MocksConsumers {
  mockRegistry: MockRegistry;
  mockManager: Pick<LifecycleCoordinator, "setMocksFile">;
}

/**
 * Hand the mocks a load produced to the mock manager.
 *
 * A mocks file that did not load leaves the mocks as they were — a running
 * one keeps serving — and says why on each, so the fix is one save away. A
 * project with no mocks file declares no mocks, so deleting it removes them.
 *
 * @param mocks - The mocks part of a config load
 * @param consumers - The registry the mocks are synced into, and the manager told of the file
 */
export function applyLoadedMocks(mocks: LoadedCourierMocks, consumers: MocksConsumers): void {
  if (mocks.error !== null) {
    log.warn(`${mocks.file} failed to load`, mocks.error);
    /* The loader's message spans lines; the UI shows it on one, the terminal has it whole. */
    consumers.mockManager.setMocksFile({ file: mocks.file, error: describeError(mocks.error) });
    return;
  }
  consumers.mockManager.setMocksFile({ file: mocks.file, error: null });
  consumers.mockRegistry.syncFromMocks(mocks.entries, mocks.fingerprints);
}
