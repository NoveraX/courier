import { AsyncLocalStorage } from "node:async_hooks";
import { studioHooks } from "@noverax/courier/internal";

/**
 * Keep the registered sources in step with `courier.config` while the
 * application redefines its sources in development.
 *
 * A dev server evaluates the module that defines an API again whenever the
 * file changes, and the registry the proxy reads would otherwise go on
 * serving the definition loaded at startup. Each `defineApi()` the
 * application runs therefore reloads the config and registers what it
 * declares — the config's keys, and whatever it composed around a source,
 * such as a boundary.
 *
 * The source that was just defined is never registered by itself. Guessing
 * which config key it replaced let an unrelated source that shared a host and
 * a group name take over another's key, stripped a boundary the config had
 * added, made a source the config never declared reachable through the proxy,
 * and threw from inside the application's own `defineApi()`.
 *
 * The sources a reload evaluates define themselves too; those are its own and
 * are not taken for a change. Definitions made one after another while a
 * module evaluates share one reload.
 *
 * @param reload - Loads the config and registers its sources. It reports its
 *   own failures and never rejects.
 * @example
 * ```ts
 * followConfigSources(async () => {
 *   const loaded = await loadCourierConfig();
 *   if (loaded) registerSources(loaded.config.sources);
 * });
 * ```
 */
export function followConfigSources(reload: () => Promise<void>): void {
  const ownReload = new AsyncLocalStorage<true>();
  let requested = false;
  let reloading = false;

  async function drain(): Promise<void> {
    reloading = true;
    /* A module defines its sources in one pass; the rest of them are
       requested before this resumes, and join the same reload. */
    await Promise.resolve();
    while (requested) {
      requested = false;
      await ownReload.run(true, reload);
    }
    reloading = false;
  }

  /* Assigned rather than added to: a second attach in the same process
     replaces the listener, so a definition never reloads twice. */
  studioHooks.onSourceDefined = () => {
    if (ownReload.getStore()) return;
    requested = true;
    if (!reloading) void drain();
  };
}
