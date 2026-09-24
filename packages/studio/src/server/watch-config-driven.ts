import { createLogger } from "@noverax/courier";

import type { ConfigWatcher } from "./config-watcher";
import { type InitConfigDrivenDeps, initConfigDriven } from "./init-config-driven";
import { withinBudget } from "./within-budget";

const log = createLogger("Studio");

/** The config watch as the server holds it: the watcher may not have started yet. */
export interface ConfigDrivenWatch {
  /** Stop watching; a watcher that starts after this is stopped at once. */
  stop(): void;
  /** The watcher, or `null` while the first load is still under way. */
  watcher(): ConfigWatcher | null;
  /** Let an edit under way finish, for at most `budgetMs`. */
  finishEdits(budgetMs: number): Promise<void>;
}

/**
 * Load the config and watch it, without making the server wait for either.
 *
 * @param deps - What loading and watching the config need
 * @returns The watch
 */
export function watchConfigDriven(deps: InitConfigDrivenDeps): ConfigDrivenWatch {
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
    watcher: () => watcher,
    finishEdits: async (budgetMs) => {
      if (watcher) await withinBudget(watcher.editsSettled(), budgetMs);
    },
  };
}
