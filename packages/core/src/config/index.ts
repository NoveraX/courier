import type { AnySource } from "../define/types";
import type { NexusConfig } from "./types";

/**
 * Identity helper for typing a `nexus.config.ts` export.
 *
 * Generic over `TSources` so per-source typings flow through to anything that
 * later loads the config — there is no runtime work, only inference.
 *
 * @example
 * ```ts
 * // nexus.config.ts
 * import { defineConfig } from "@noverax/nexus/config";
 * import { jsonPlaceholderApi } from "./src/api";
 *
 * export default defineConfig({
 *   sources: { jsonPlaceholder: jsonPlaceholderApi },
 *   studio: { port: 6280 },
 * });
 * ```
 */
export function defineConfig<TSources extends Record<string, AnySource>>(
  config: NexusConfig<TSources>,
): NexusConfig<TSources> {
  return config;
}

export type {
  NexusConfig,
  NexusFileImport,
  NexusImportAuth,
  NexusImportBase,
  NexusImportEntry,
  NexusImportGenerateClient,
  NexusImportGroupBy,
  NexusImportSelector,
  NexusImportSpecType,
  NexusImportType,
  NexusImportValidation,
  NexusRawImport,
  NexusRuntimeConfig,
  NexusServerConfig,
  NexusStudioConfig,
  NexusUrlImport,
} from "./types";
