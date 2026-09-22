import type { AnySource } from "../define/types";
import type { CourierConfig } from "./types";

/**
 * Identity helper for typing a `courier.config.ts` export.
 *
 * Generic over `TSources` so per-source typings flow through to anything that
 * later loads the config — there is no runtime work, only inference.
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
export {
  STUDIO_DEFAULT_HOST,
  STUDIO_DEFAULT_PORT,
  STUDIO_DEFAULT_URL,
} from "./studio-address";

export function defineConfig<TSources extends Record<string, AnySource>>(
  config: CourierConfig<TSources>,
): CourierConfig<TSources> {
  return config;
}

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
