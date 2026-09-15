/**
 * Load `nexus.config.ts` if present and start the config watcher.
 *
 * A missing config is treated as a no-op so the studio dev server can still
 * come up with an empty binding table. Other load errors are logged so they
 * remain visible without crashing startup. The successful path pushes the
 * loaded config into the binding table + mock registry, then attaches an
 * `onReload` callback so subsequent file changes flow through the same path.
 */

import { createLogger } from "@noverax/nexus";
import type { Namespace } from "socket.io";
import type { BindingTable } from "./catalog/binding-table";
import { type LoadedNexusConfig, loadNexusConfig } from "./config-loader";
import { ConfigNotFoundError } from "./config-loader-errors";
import { type ConfigWatcher, startConfigWatcher } from "./config-watcher";
import type { MockRegistry } from "./mock-registry";

const log = createLogger("Studio");

export interface InitConfigDrivenDeps {
  projectRoot: string;
  bindingTable: BindingTable;
  mockRegistry: MockRegistry;
  uiNamespace: Namespace;
  setConfigPath: (path: string) => void;
}

export async function initConfigDriven(deps: InitConfigDrivenDeps): Promise<ConfigWatcher | null> {
  const { projectRoot, bindingTable, mockRegistry, uiNamespace, setConfigPath } = deps;

  let loaded: LoadedNexusConfig;
  try {
    loaded = await loadNexusConfig(projectRoot);
  } catch (err) {
    if (err instanceof ConfigNotFoundError) return null;
    log.warn("nexus.config load failed", err);
    return null;
  }

  setConfigPath(loaded.configFile);
  bindingTable.setConfig(loaded.config);
  mockRegistry.syncFromConfig(loaded.config);
  uiNamespace.emit("config:update", { configFile: loaded.configFile });
  uiNamespace.emit("binding:snapshot", bindingTable.getStatus());

  return startConfigWatcher(loaded, {
    projectRoot,
    bindingTable,
    uiNamespace,
    onReload: (next) => {
      setConfigPath(next.configFile);
      mockRegistry.syncFromConfig(next.config);
    },
  });
}
