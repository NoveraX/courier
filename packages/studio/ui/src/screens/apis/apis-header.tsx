import { FileJson, Plus, RefreshCw } from "lucide-react";

import type { UseOpenApiExportReturn } from "@/apis/use-openapi-export";
import { OverflowMenu } from "@/design/overflow-menu";
import { Skeleton } from "@/design/skeleton";
import { cn } from "@/lib/utils";
import { ExportOpenApiButton } from "./export-openapi-button";
import { exportedSource } from "./exported-source";

interface ApisHeaderProps {
  /**
   * What the project declares, said under the title: a bar while it loads,
   * `null` when Studio could not be reached to tell it.
   */
  summary: string | null | undefined;
  /** Whether there is an import to check, and whether a check runs now. */
  check: { can: boolean; running: boolean; onCheck: () => void };
  exporter: UseOpenApiExportReturn;
  /** The sources the config declares, which the export offers. */
  sources: readonly string[];
  /** Why Import API is off, or `null` while it is on. */
  importBlocked: string | null;
  onImport: () => void;
}

/**
 * The APIs page's header: its title and what the project declares, a
 * check of every import for a newer spec, the export as an OpenAPI
 * document, and Import API. On a phone the title and Import API share the
 * first row, the count goes under them, and the check and the export move
 * into a "⋯" menu.
 *
 * @param props - The count, the check, the export, and Import API
 * @returns The header
 * @example
 * ```tsx
 * <ApisHeader summary="1 imported · 2 hand-written · 18 endpoints" check={check} exporter={exporter} sources={names} importBlocked={null} onImport={open} />
 * ```
 */
export function ApisHeader(props: ApisHeaderProps): React.ReactNode {
  const { summary, check, exporter, sources, importBlocked, onImport } = props;
  const exported = exportedSource(exporter, sources);
  return (
    <header className="flex flex-wrap items-end gap-3.5 max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto_auto] max-sm:items-center max-sm:gap-x-2 max-sm:gap-y-1">
      <div className="flex min-w-0 flex-col gap-1 max-sm:contents">
        <h1 className="m-0 text-page font-semibold tracking-[-0.025em]">APIs</h1>
        {summary === undefined ? (
          <Skeleton className="my-0.75 h-3 w-64 max-sm:col-span-full max-sm:row-start-2 max-sm:w-48" />
        ) : (
          summary !== null && (
            <span className="text-control text-fg-subtle max-sm:col-span-full max-sm:row-start-2">
              {summary}
            </span>
          )
        )}
      </div>
      <div className="flex-1 max-sm:hidden" />
      <button
        type="button"
        disabled={!check.can || check.running}
        onClick={check.onCheck}
        className="flex h-8 cursor-pointer items-center gap-1.75 rounded-card border border-line bg-panel px-3 text-control whitespace-nowrap text-fg-muted hover:border-line-strong hover:text-fg disabled:cursor-default disabled:opacity-50 max-sm:hidden pointer-coarse:h-9"
      >
        <RefreshCw
          aria-hidden="true"
          className={cn("size-3.25", check.running && "animate-spin")}
        />
        {check.running ? "Checking…" : "Check for updates"}
      </button>
      <ExportOpenApiButton exporter={exporter} sources={sources} className="max-sm:hidden" />
      <button
        type="button"
        disabled={importBlocked !== null}
        title={importBlocked ?? undefined}
        onClick={onImport}
        className="flex h-8 cursor-pointer items-center gap-1.75 rounded-card bg-fg px-3.25 text-control font-semibold whitespace-nowrap text-bg hover:bg-fg/90 disabled:cursor-default disabled:opacity-50 pointer-coarse:h-9"
      >
        <Plus aria-hidden="true" className="size-3.25" />
        Import API
      </button>
      <OverflowMenu
        label="More actions"
        className="sm:hidden"
        actions={[
          {
            key: "check",
            label: check.running ? "Checking…" : "Check for updates",
            icon: RefreshCw,
            disabled: !check.can || check.running,
            onSelect: check.onCheck,
          },
          {
            key: "export",
            label: "Export OpenAPI",
            icon: FileJson,
            disabled: exported === undefined,
            onSelect: () => exported !== undefined && exporter.start(exported),
          },
        ]}
      />
    </header>
  );
}
