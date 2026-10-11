import { dirname } from "node:path";

import { createLogger, detectAppOrigin, registerSources, setAppOrigin } from "@noverax/courier";
import type { CourierConfig } from "@noverax/courier/config";
import type { ServerRuntimeSetup } from "./attach-runtime-core";
import type { LoadedCourierConfig } from "./load-config";
import { readStudioToken } from "./read-studio-token";

const log = createLogger("Runtime");

/** How a server runtime loads its config. */
export interface ConfigRegistration {
  /**
   * Load the config again whenever a file it depends on is saved, and
   * register its sources anew — for a process no dev server reloads, such
   * as the MCP server in an editor. In production as in development.
   */
  readonly followFiles?: boolean | undefined;
}

/**
 * Load courier.config from disk for a server runtime: register its sources and
 * set the app origin. Outside production, the sources are registered again
 * from the config whenever the application redefines one, as a dev server
 * does on every edit; with `followFiles`, whenever a file the config depends
 * on is saved.
 *
 * Attaching must not take down the host application, so a config that will not
 * load is logged rather than thrown, and the app origin is still detected.
 *
 * @param registration - Whether the config is loaded again on a save
 * @returns The config's `studio` block, which says where Studio listens, or
 *   `undefined` when there is no usable config.
 */
export async function registerFromConfig(
  registration: ConfigRegistration = {},
): Promise<ServerRuntimeSetup | undefined> {
  try {
    /* Loaded on demand, so the loader and the TypeScript loader behind it
       cost nothing until a server attaches. */
    const { loadCourierConfig } = await import("./load-config");
    const modules = new Set<string>();
    const loaded: LoadedCourierConfig | null = await loadCourierConfig(
      registration.followFiles === true ? { onModule: (file) => modules.add(file) } : {},
    );
    if (loaded) {
      /* Registration is inside the same try: a config that loads but declares
         no usable `sources` is the same kind of failure as one that will not
         load, and neither may end the host's startup. */
      registerSources(loaded.config.sources);
      setAppOrigin(loaded.config.runtime?.appOrigin ?? detectAppOrigin());
      let current = loaded.config;
      const reloaded = (config: CourierConfig): void => {
        current = config;
      };
      if (registration.followFiles === true) {
        const { reloadOnSave } = await import("./reload-on-save");
        reloadOnSave(loaded.configFile, modules, (config) => {
          /* The config before the sources: what reads it on their change finds it current. */
          reloaded(config);
          registerSources(config.sources);
        });
      } else if (process.env.NODE_ENV !== "production") {
        await followConfig(loadCourierConfig, reloaded);
      }
      const projectRoot = dirname(loaded.configFile);
      return {
        studio: loaded.config.studio ?? {},
        readToken: () => readStudioToken(projectRoot),
        config: () => current,
      };
    }
  } catch (err) {
    /* A config that exists and will not load leaves the app with no sources at
       all — say why. The first request then fails with SOURCES_NOT_REGISTERED,
       which names the remedy. */
    log.error("courier.config could not be loaded; no sources were registered", err);
  }
  setAppOrigin(detectAppOrigin());
  return undefined;
}

async function followConfig(
  load: () => Promise<LoadedCourierConfig | null>,
  reloaded: (config: CourierConfig) => void,
): Promise<void> {
  const { followConfigSources } = await import("./follow-config-sources");
  followConfigSources(async () => {
    try {
      const loaded = await load();
      if (!loaded) {
        log.warn("courier.config is gone; the sources registered from it stay in force");
        return;
      }
      /* The config before the sources: what reads it on their change finds it current. */
      reloaded(loaded.config);
      registerSources(loaded.config.sources);
    } catch (err) {
      /* An edit caught half-way through, or one that breaks the config, must
         not leave the app with nothing to serve: the last good sources stay. */
      log.error("courier.config could not be reloaded; the sources registered before stay", err);
    }
  });
}
