import { createLogger } from "@noverax/courier";
import {
  formatStudioUrl,
  STUDIO_DEFAULT_HOST,
  STUDIO_DEFAULT_PORT,
  STUDIO_DEFAULT_URL,
} from "@noverax/courier/config";
import { loadCourierConfig } from "../../server/config-loader";

const log = createLogger("StudioPlugin");

const DEFAULT_URL = STUDIO_DEFAULT_URL;

/** Per-cwd cache so each plugin instance only walks the filesystem once */
const cache = new Map<string, Promise<string>>();

/**
 * Resolve the Studio dev-server URL for a given project root by reading
 * `studio.host` and `studio.port` from `courier.config.ts`.
 *
 * Falls back to the shared default address (and warns) when no config file
 * exists or the config cannot be parsed — build plugins must always be
 * able to emit a snippet so the dev experience never blocks on a missing
 * config file.
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
    .catch((err) => {
      log.debug(
        `No courier.config found at ${projectRoot}, using default Studio URL — ${describe(err)}`,
      );
      return DEFAULT_URL;
    });

  cache.set(projectRoot, promise);
  return promise;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
