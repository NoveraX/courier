import { createLogger } from "@noverax/courier";
import {
  formatStudioUrl,
  STUDIO_DEFAULT_HOST,
  STUDIO_DEFAULT_PORT,
  STUDIO_DEFAULT_URL,
} from "@noverax/courier/config";

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
 * Only the config is read — not `courier.mocks.*`, and not Studio's own
 * loader, so the bundler never loads Studio's dependency walk or its parser.
 * The loader is imported when the first read happens, so a bundler that
 * imports a plugin with injection off, as in a production build, loads none
 * of it. The read reuses the transforms Studio keeps in the project's
 * `node_modules` and keeps its own there, through a cache it drops once the
 * read ends: the bundler reads each root once.
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

  const promise = readStudioUrl(projectRoot).catch((err: unknown) => {
    log.warn(
      `courier.config could not be loaded, so Studio is expected at ${STUDIO_DEFAULT_URL}`,
      err,
    );
    return STUDIO_DEFAULT_URL;
  });

  cache.set(projectRoot, promise);
  return promise;
}

async function readStudioUrl(projectRoot: string): Promise<string> {
  const { createTransformCache, findTransformCacheDirectory, loadCourierConfig } = await import(
    "@noverax/courier-studio-core/config"
  );
  const transformCache = createTransformCache({
    directory: findTransformCacheDirectory(projectRoot),
  });
  const loaded = await loadCourierConfig({ cwd: projectRoot, requireAtCwd: true, transformCache });
  if (loaded === null) {
    log.debug(`No courier.config in ${projectRoot}; Studio is expected at ${STUDIO_DEFAULT_URL}`);
    return STUDIO_DEFAULT_URL;
  }
  const studio = loaded.config.studio ?? {};
  return formatStudioUrl(studio.host ?? STUDIO_DEFAULT_HOST, studio.port ?? STUDIO_DEFAULT_PORT);
}
