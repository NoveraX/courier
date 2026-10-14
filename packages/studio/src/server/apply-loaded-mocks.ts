import { createLogger } from "@noverax/courier";
import { isRecord } from "@noverax/courier-cli/devkit";
import type { LoadedCourierConfig } from "./config-loader";
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
 * @param loaded - The mocks a config load produced, and the config whose sources they serve
 * @param consumers - The registry the mocks are synced into, and the manager told of the file
 * @param root - The project root, which the reason a page is shown names paths relative to
 */
export function applyLoadedMocks(
  { mocks, config }: Pick<LoadedCourierConfig, "mocks" | "config">,
  consumers: MocksConsumers,
  root: string,
): void {
  if (mocks.error !== null) {
    log.warn(`${mocks.file} failed to load`, mocks.error);
    /* The loader's message spans lines; the UI shows it on one, the terminal has it whole. */
    consumers.mockManager.setMocksFile({
      file: mocks.file,
      error: describeError(mocks.error, root),
    });
    return;
  }
  consumers.mockManager.setMocksFile({ file: mocks.file, error: null });
  const served = servedSources(mocks.entries, config.sources);
  consumers.mockRegistry.syncFromMocks(mocks.entries, mocks.fingerprints, served);
}

/* Which of the config's sources each mock serves: the mocks file and the
   config load in one graph, so a mock holds the very source object. */
function servedSources(
  entries: Record<string, unknown>,
  sources: Record<string, unknown>,
): Map<string, string> {
  const names = new Map<unknown, string>(Object.entries(sources).map(([name, api]) => [api, name]));
  const served = new Map<string, string>();
  for (const [key, entry] of Object.entries(entries)) {
    const name = isRecord(entry) ? names.get(entry.source) : undefined;
    if (name !== undefined) served.set(key, name);
  }
  return served;
}
