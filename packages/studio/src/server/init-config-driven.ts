/**
 * Load `courier.config.ts` if present and start the config watcher.
 *
 * A missing config leaves the binding table empty and other load errors are
 * logged, without crashing startup — and the watcher starts either way, so
 * creating or fixing the config is picked up without a restart. The
 * successful path pushes the loaded config into the binding table and the
 * mocks from `courier.mocks.ts` into the mock manager, then attaches an
 * `onReload` callback so subsequent file changes flow through the same path.
 */

import { createLogger } from "@noverax/courier";
import type { Namespace } from "socket.io";
import { applyLoadedMocks } from "./apply-loaded-mocks";
import type { BindingTable } from "./catalog/binding-table";
import { type LoadedCourierConfig, loadCourierConfig } from "./config-loader";
import { ConfigNotFoundError } from "./config-loader-errors";
import { type ConfigWatcher, startConfigWatcher } from "./config-watcher";
import type { LifecycleCoordinator } from "./mock-manager";
import type { MockRegistry } from "./mock-registry";
import { recordStartupIssue } from "./startup-issues";
import type { WatcherStatus } from "./watcher-status";

const log = createLogger("Studio");

export interface InitConfigDrivenDeps {
  projectRoot: string;
  bindingTable: BindingTable;
  mockRegistry: MockRegistry;
  uiNamespace: Namespace;
  watcherStatus: WatcherStatus;
  mockManager: Pick<LifecycleCoordinator, "setMocksFile">;
}

export async function initConfigDriven(deps: InitConfigDrivenDeps): Promise<ConfigWatcher> {
  const { projectRoot, bindingTable, uiNamespace, watcherStatus } = deps;

  let loaded: LoadedCourierConfig | null = null;
  let initialError: unknown = null;
  try {
    loaded = await loadCourierConfig(projectRoot);
  } catch (err) {
    if (!(err instanceof ConfigNotFoundError)) {
      initialError = err;
      /* Recorded as well as logged: without a config there is no binding
         table, and the banner that follows would otherwise present that as
         a normal start. The watcher below still starts, so the fix is
         picked up when it is saved. */
      log.warn("courier.config load failed", err);
      recordStartupIssue("courier.config did not load, so no sources are bound", err);
    }
  }

  if (loaded) {
    bindingTable.setConfig(loaded.config);
    applyLoadedMocks(loaded.mocks, deps);
    if (loaded.mocks.error !== null) {
      recordStartupIssue(
        "courier.mocks.ts did not load, so no mocks are declared",
        loaded.mocks.error,
      );
    }
    uiNamespace.emit("config:update", { configFile: loaded.configFile });
    uiNamespace.emit("binding:snapshot", bindingTable.getStatus());
  }

  return startConfigWatcher(loaded, {
    projectRoot,
    bindingTable,
    uiNamespace,
    watcherStatus,
    initialError,
    onReload: (next) => applyLoadedMocks(next.mocks, deps),
  });
}
