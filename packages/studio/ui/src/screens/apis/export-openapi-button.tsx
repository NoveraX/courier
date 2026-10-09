import { FileJson } from "lucide-react";

import type { UseOpenApiExportReturn } from "@/apis/use-openapi-export";

/**
 * The APIs page's Export OpenAPI: opens the export on the source exported
 * last, or the first the config declares.
 *
 * @param props - The export's state, and the sources the config declares
 * @returns The button, disabled while the config declares none
 * @example
 * ```tsx
 * <ExportOpenApiButton exporter={exporter} sources={["shop", "payments"]} />
 * ```
 */
export function ExportOpenApiButton({
  exporter,
  sources,
}: {
  exporter: UseOpenApiExportReturn;
  sources: readonly string[];
}): React.ReactNode {
  const source = sources.includes(exporter.request.source) ? exporter.request.source : sources[0];
  return (
    <button
      type="button"
      disabled={source === undefined}
      onClick={() => source !== undefined && exporter.start(source)}
      className="flex h-8 cursor-pointer items-center gap-1.75 rounded-card border border-line bg-panel px-3 text-control whitespace-nowrap text-fg-muted hover:border-line-strong hover:text-fg disabled:cursor-default disabled:opacity-50"
    >
      <FileJson aria-hidden="true" className="size-3.25" />
      Export OpenAPI
    </button>
  );
}
