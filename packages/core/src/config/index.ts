import type { AnySource } from "../define/types";
import type { CourierConfig } from "./types";

export {
  formatStudioUrl,
  STUDIO_DEFAULT_HOST,
  STUDIO_DEFAULT_PORT,
  STUDIO_DEFAULT_URL,
} from "./studio-address";

/**
 * Identity helper for typing a `courier.config.ts` export.
 *
 * Generic over `TSources` so per-source typings flow through to anything that
 * later loads the config — there is no runtime work, only inference.
 *
 * @param config - The project's sources, API imports, and Studio and server settings
 * @returns The same config, typed
 *
 * @example
 * ```ts
 * // courier.config.ts
 * import { defineConfig } from "@noverax/courier/config";
 * import { jsonPlaceholderApi } from "./src/api";
 *
 * export default defineConfig({
 *   sources: { jsonPlaceholder: jsonPlaceholderApi },
 *   studio: { port: 6280 },
 * });
 * ```
 */
export function defineConfig<TSources extends Record<string, AnySource>>(
  config: CourierConfig<TSources>,
): CourierConfig<TSources> {
  return config;
}

export type { AgentOffer, AgentPolicy } from "../agent/agent-policy";
/* Named by the types an API's definition infers, so a project that emits declarations can name them too. */
export type { WebBody, WebCredentials } from "../http-client/web-types";
export type {
  CourierConfig,
  CourierFileImport,
  CourierImportAuth,
  CourierImportBase,
  CourierImportEntry,
  CourierImportGenerateClient,
  CourierImportGroupBy,
  CourierImportSelector,
  CourierImportSpecType,
  CourierImportType,
  CourierImportValidation,
  CourierRawImport,
  CourierRuntimeConfig,
  CourierServerConfig,
  CourierStudioConfig,
  CourierUrlImport,
} from "./types";
