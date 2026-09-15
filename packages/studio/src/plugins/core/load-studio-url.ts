import { createLogger } from "@noverax/nexus";
import { loadNexusConfig } from "../../server/config-loader";

const log = createLogger("StudioPlugin");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 6280;
const DEFAULT_URL = `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;

/** Per-cwd cache so each plugin instance only walks the filesystem once */
const cache = new Map<string, Promise<string>>();

/**
 * Resolve the Studio dev-server URL for a given project root by reading
 * `studio.host` and `studio.port` from `nexus.config.ts`.
 *
 * Falls back to `http://127.0.0.1:6280` (and warns) when no config file
 * exists or the config cannot be parsed — build plugins must always be
 * able to emit a snippet so the dev experience never blocks on a missing
 * config file.
 *
 * The cache is keyed by `projectRoot`, so changing `studio.port` in
 * `nexus.config.ts` requires restarting the bundler (consistent with how
 * every other build-plugin option behaves).
 */
export function loadStudioUrl(projectRoot: string = process.cwd()): Promise<string> {
  const cached = cache.get(projectRoot);
  if (cached) return cached;

  const promise = loadNexusConfig(projectRoot)
    .then(({ config }) => {
      const studio = config.studio ?? {};
      const host = studio.host ?? DEFAULT_HOST;
      const port = studio.port ?? DEFAULT_PORT;
      return `http://${host}:${port}`;
    })
    .catch((err) => {
      log.debug(
        `No nexus.config found at ${projectRoot}, using default Studio URL — ${describe(err)}`,
      );
      return DEFAULT_URL;
    });

  cache.set(projectRoot, promise);
  return promise;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
