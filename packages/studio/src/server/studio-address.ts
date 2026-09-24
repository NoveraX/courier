/**
 * The `studio` block of `courier.config.ts`, read before the server binds.
 *
 * The rest of the config is loaded later, once the server is up, by
 * `initConfigDriven`. The address cannot wait for that: it decides what to
 * bind. A config that will not load is not this function's problem — it is
 * reported properly by the later load — so an unreadable one yields no
 * address, the defaults apply, and why is logged at debug level only.
 */

import { createLogger } from "@noverax/courier";
import { loadCourierConfig } from "@noverax/courier-studio-core/config";
import { studioTransformCache } from "./studio-transform-cache";

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
 * modules this read already transformed.
 *
 * @param projectRoot - The directory holding `courier.config.*`
 * @returns The `studio` block's address fields, or nothing when there is no
 *   config or it does not load
 * @example
 * ```ts
 * const { host = "localhost", port = 6280 } = await readStudioAddress(projectRoot);
 * ```
 */
export async function readStudioAddress(projectRoot: string): Promise<StudioAddress> {
  try {
    const loaded = await loadCourierConfig({
      cwd: projectRoot,
      requireAtCwd: true,
      transformCache: studioTransformCache(projectRoot),
    });
    const studio = loaded?.config.studio;
    return {
      host: studio?.host,
      port: studio?.port,
      mockBasePort: studio?.mockBasePort,
      open: studio?.open,
    };
  } catch (error) {
    /* Reported where the config is loaded for real; here it only means the
       flags and the built-in defaults decide. */
    log.debug(
      `courier.config in ${projectRoot} could not be read for Studio's address; the defaults apply`,
      error,
    );
    return {};
  }
}
