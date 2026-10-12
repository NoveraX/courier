import type { UseOpenApiExportReturn } from "@/apis/use-openapi-export";

/**
 * The source the APIs page's export opens on: the one exported last, while
 * the config still declares it, or the first it declares.
 *
 * @param exporter - The export's state
 * @param sources - The sources the config declares
 * @returns The source, or `undefined` while the config declares none
 * @example
 * ```ts
 * exportedSource(exporter, ["shop", "payments"]); // "shop"
 * ```
 */
export function exportedSource(
  exporter: UseOpenApiExportReturn,
  sources: readonly string[],
): string | undefined {
  return sources.includes(exporter.request.source) ? exporter.request.source : sources[0];
}
