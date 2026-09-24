import { createLogger } from "@noverax/courier";
import {
  formatStudioUrl,
  STUDIO_DEFAULT_HOST,
  STUDIO_DEFAULT_PORT,
  STUDIO_DEFAULT_URL,
} from "@noverax/courier/config";
import { loadCourierConfig } from "../../server/config-loader";
import { ConfigNotFoundError } from "../../server/config-loader-errors";

const log = createLogger("StudioPlugin");

/** Per-cwd cache so each plugin instance only walks the filesystem once */
const cache = new Map<string, Promise<string>>();

/**
 * Resolve the Studio dev-server URL for a given project root by reading
 * `studio.host` and `studio.port` from `courier.config.ts`.
 *
 * Falls back to the shared default address when the config cannot say —
 * build plugins must always be able to emit a snippet so the dev experience
 * never blocks on the config. A project without a config is normal and passes
 * quietly; a config that exists and fails to load is worth a warning, since
 * the fallback may then be the wrong address.
 *
 * The cache is keyed by `projectRoot`, so changing `studio.port` in
 * `courier.config.ts` requires restarting the bundler (consistent with how
 * every other build-plugin option behaves).
 */
export function loadStudioUrl(projectRoot: string = process.cwd()): Promise<string> {
  const cached = cache.get(projectRoot);
  if (cached) return cached;

  const promise = loadCourierConfig(projectRoot)
    .then(({ config }) => {
      const studio = config.studio ?? {};
      return formatStudioUrl(
        studio.host ?? STUDIO_DEFAULT_HOST,
        studio.port ?? STUDIO_DEFAULT_PORT,
      );
    })
    .catch((err: unknown) => {
      if (err instanceof ConfigNotFoundError) {
        log.debug(
          `No courier.config in ${projectRoot}; Studio is expected at ${STUDIO_DEFAULT_URL}`,
        );
      } else {
        log.warn(
          `courier.config could not be loaded, so Studio is expected at ${STUDIO_DEFAULT_URL}`,
          err,
        );
      }
      return STUDIO_DEFAULT_URL;
    });

  cache.set(projectRoot, promise);
  return promise;
}
