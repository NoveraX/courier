import { FileJson } from "lucide-react";

import type { UseOpenApiExportReturn } from "@/apis/use-openapi-export";
import { cn } from "@/lib/utils";
import { exportedSource } from "./exported-source";

/**
 * The APIs page's Export OpenAPI: opens the export on the source exported
 * last, or the first the config declares.
 *
 * @param props - The export's state, the sources the config declares, and classes for the button
 * @returns The button, disabled while the config declares none
 * @example
 * ```tsx
 * <ExportOpenApiButton exporter={exporter} sources={["shop", "payments"]} />
 * ```
 */
export function ExportOpenApiButton({
  exporter,
  sources,
  className,
}: {
  exporter: UseOpenApiExportReturn;
  sources: readonly string[];
  className?: string | undefined;
}): React.ReactNode {
  const source = exportedSource(exporter, sources);
  return (
    <button
      type="button"
      disabled={source === undefined}
      onClick={() => source !== undefined && exporter.start(source)}
      className={cn(
        "flex h-8 cursor-pointer items-center gap-1.75 rounded-card border border-line bg-panel px-3 text-control whitespace-nowrap text-fg-muted hover:border-line-strong hover:text-fg disabled:cursor-default disabled:opacity-50 pointer-coarse:h-9",
        className,
      )}
    >
      <FileJson aria-hidden="true" className="size-3.25" />
      Export OpenAPI
    </button>
  );
}
