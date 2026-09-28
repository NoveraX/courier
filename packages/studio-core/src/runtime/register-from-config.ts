import { createLogger, detectAppOrigin, registerSources, setAppOrigin } from "@noverax/courier";
import type { LoadedCourierConfig } from "./load-config";
import type { ConfiguredStudioAddress } from "./runtime-environment";

const log = createLogger("Runtime");

/**
 * Load courier.config from disk for a server runtime: register its sources and
 * set the app origin. Outside production, the sources are registered again
 * from the config whenever the application redefines one, as a dev server
 * does on every edit.
 *
 * Attaching must not take down the host application, so a config that will not
 * load is logged rather than thrown, and the app origin is still detected.
 *
 * @returns The config's `studio` block, which says where Studio listens, or
 *   `undefined` when there is no usable config.
 */
export async function registerFromConfig(): Promise<ConfiguredStudioAddress | undefined> {
  try {
    /* Loaded on demand, so the loader and the TypeScript loader behind it
       cost nothing until a server attaches. */
    const { loadCourierConfig } = await import("./load-config");
    const loaded: LoadedCourierConfig | null = await loadCourierConfig();
    if (loaded) {
      /* Registration is inside the same try: a config that loads but declares
         no usable `sources` is the same kind of failure as one that will not
         load, and neither may end the host's startup. */
      registerSources(loaded.config.sources);
      setAppOrigin(loaded.config.runtime?.appOrigin ?? detectAppOrigin());
      if (process.env.NODE_ENV !== "production") await followConfig(loadCourierConfig);
      return loaded.config.studio ?? {};
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

async function followConfig(load: () => Promise<LoadedCourierConfig | null>): Promise<void> {
  const { followConfigSources } = await import("./follow-config-sources");
  followConfigSources(async () => {
    try {
      const loaded = await load();
      if (!loaded) {
        log.warn("courier.config is gone; the sources registered from it stay in force");
        return;
      }
      registerSources(loaded.config.sources);
    } catch (err) {
      /* An edit caught half-way through, or one that breaks the config, must
         not leave the app with nothing to serve: the last good sources stay. */
      log.error("courier.config could not be reloaded; the sources registered before stay", err);
    }
  });
}
