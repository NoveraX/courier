/**
 * The `studio` block of `courier.config.ts`, read before the server binds.
 *
 * The rest of the config is loaded as the server starts, on the reload
 * chain `createProjectState` owns. The address cannot wait for that:
 * it decides what to bind. A config that will not load is not this
 * function's problem — it is reported properly by the later load — so an
 * unreadable one yields no address, the defaults apply, and why is logged
 * at debug level only.
 *
 * A config that takes longer than the load timeout is not waited for
 * either: Studio listens where its flags or the defaults say, and says so
 * under the banner, since that address may not be the one the config asks
 * for. The read keeps the process alive while it waits — nothing else does
 * before Studio listens — so a config that awaits something that never
 * comes delays Studio by the timeout rather than ending it in silence.
 */

import { createLogger } from "@noverax/courier";
import { loadCourierConfig } from "@noverax/courier-studio-core/config";
import { ConfigLoadTimeoutError } from "./config-load-timeout-error";
import { formatDuration } from "./format-duration";
import { CONFIG_LOAD_TIMEOUT_MS, CONFIG_LOAD_TIMEOUT_VARIABLE } from "./project-state/budgets";
import { recordStartupIssue } from "./startup-issues";
import { studioTransformCache } from "./studio-transform-cache";
import { withFreshJson } from "./with-fresh-json";
import { withTimeout } from "./with-timeout";

const log = createLogger("Studio");

/** What a project asks of Studio, when it asks at all. */
export interface StudioAddress {
  host?: string;
  port?: number;
  /** First port handed to a managed mock server that named none itself. */
  mockBasePort?: number;
  /** Whether to open the Studio UI in a browser once it listens. */
  open?: boolean;
}

/**
 * Read the address a project asks Studio to listen on.
 *
 * The config is loaded through Studio's transform cache for the project, so
 * the full load that follows once Studio listens transforms none of the
 * modules this read already transformed. A JSON module it reads is dropped
 * from Node's require cache again, so that load reads it from disk too.
 *
 * @param projectRoot - The directory holding `courier.config.*`
 * @param timeoutMs - How long the config may take to load (default:
 *   `CONFIG_LOAD_TIMEOUT_MS`)
 * @returns The `studio` block's address fields, or nothing when there is no
 *   config, it does not load, or it takes longer than `timeoutMs`
 * @example
 * ```ts
 * const { host = "localhost", port = 6280 } = await readStudioAddress(projectRoot);
 * ```
 */
export async function readStudioAddress(
  projectRoot: string,
  timeoutMs: number = CONFIG_LOAD_TIMEOUT_MS,
): Promise<StudioAddress> {
  const read = withFreshJson(() =>
    loadCourierConfig({
      cwd: projectRoot,
      requireAtCwd: true,
      transformCache: studioTransformCache(projectRoot),
    }),
  );
  try {
    const loaded = await withTimeout(read, timeoutMs, () => new ConfigLoadTimeoutError(timeoutMs), {
      keepAlive: true,
    });
    const studio = loaded?.config.studio;
    return {
      host: studio?.host,
      port: studio?.port,
      mockBasePort: studio?.mockBasePort,
      open: studio?.open,
    };
  } catch (error) {
    if (error instanceof ConfigLoadTimeoutError) return gaveUp(timeoutMs);
    /* Reported where the config is loaded for real; here it only means the
       flags and the built-in defaults decide. */
    log.debug(
      `courier.config in ${projectRoot} could not be read for Studio's address; the defaults apply`,
      error,
    );
    return {};
  }
}

function gaveUp(timeoutMs: number): StudioAddress {
  const summary =
    `courier.config took longer than ${formatDuration(timeoutMs)} to load, so Studio did not wait ` +
    "for its address: the flags and the defaults decide where it listens. To give it longer, " +
    `start Studio with ${CONFIG_LOAD_TIMEOUT_VARIABLE} set to the milliseconds it needs`;
  log.warn(summary);
  recordStartupIssue(summary);
  return {};
}
