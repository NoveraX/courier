import { createLogger } from "@noverax/courier";
import {
  formatStudioUrl,
  STUDIO_DEFAULT_HOST,
  STUDIO_DEFAULT_PORT,
  STUDIO_DEFAULT_URL,
} from "@noverax/courier/config";
import { createTransformCache } from "@noverax/courier-studio-core/config";
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
 *
 * The read transforms the project's modules through a cache of its own,
 * dropped once the read ends: the bundler reads each root once, so keeping
 * transforms for its whole life saves nothing, and nothing is written into
 * the project's `node_modules`, which a production build leaves as it found
 * it.
 *
 * @param projectRoot - The directory holding `courier.config.*` (default:
 *   the working directory)
 * @returns The URL the browser reaches Studio at
 * @example
 * ```ts
 * const studioUrl = await loadStudioUrl(process.cwd());
 * ```
 */
export function loadStudioUrl(projectRoot: string = process.cwd()): Promise<string> {
  const cached = cache.get(projectRoot);
  if (cached) return cached;

  const promise = loadCourierConfig(projectRoot, { transformCache: createTransformCache() })
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
