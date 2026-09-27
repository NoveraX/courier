/**
 * The `courier.config.ts` a project with no API sources yet starts from.
 * Studio loads it, so Import API can write the project's first API; the
 * source that import writes is then added to `sources`.
 *
 * @example
 * ```ts
 * void copyToClipboard(MINIMAL_CONFIG, "config");
 * ```
 */
export const MINIMAL_CONFIG =
  'import { defineConfig } from "@noverax/courier/config";\nexport default defineConfig({ sources: {} });\n';
