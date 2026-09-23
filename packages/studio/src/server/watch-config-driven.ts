import { createLogger } from "@noverax/courier";

import type { ConfigWatcher } from "./config-watcher";
import { type InitConfigDrivenDeps, initConfigDriven } from "./init-config-driven";

const log = createLogger("Studio");

/**
 * Load the config and watch it, without making the server wait for either.
 *
 * @param deps - What loading and watching the config need
 * @returns `stop`, which also stops a watcher that arrives after it
 */
export function watchConfigDriven(deps: InitConfigDrivenDeps): { stop(): void } {
  let watcher: ConfigWatcher | null = null;
  let stopped = false;
  initConfigDriven(deps)
    .then((started) => {
      // A stop() before the async load resolved stops the watcher at once,
      // so its fs.watch handles do not leak.
      if (stopped) started.stop();
      else watcher = started;
    })
    .catch((err: unknown) => log.warn("courier.config initialization failed", err));
  return {
    stop() {
      stopped = true;
      watcher?.stop();
    },
  };
}
