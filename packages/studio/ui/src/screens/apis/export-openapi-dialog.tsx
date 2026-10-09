import { Copy, Download, FileJson } from "lucide-react";
import { toast } from "sonner";

import type { UseOpenApiExportReturn } from "@/apis/use-openapi-export";
import { DialogFrame } from "@/design/dialog-frame";
import { downloadFile } from "@/lib/export";
import { writeClipboardText } from "@/lib/write-clipboard-text";
import { ExportOpenApiForm } from "./export-openapi-form";

/**
 * Export a source as an OpenAPI document — as `courier-studio openapi`
 * writes it, from the definition Studio runs — to download as a file or
 * copy, once the document is written for the options shown.
 *
 * @param props - The export's state, and the sources the config declares
 * @returns The dialog
 * @example
 * ```tsx
 * const exporter = useOpenApiExport();
 * <ExportOpenApiDialog exporter={exporter} sources={names} />
 * ```
 */
export function ExportOpenApiDialog({
  exporter,
  sources,
}: {
  exporter: UseOpenApiExportReturn;
  sources: readonly string[];
}): React.ReactNode {
  const { result, writing } = exporter;
  const ready = result !== null && !writing;
  const copy = async () => {
    if (!result) return;
    try {
      await writeClipboardText(result.text);
      toast.success(`Copied ${result.fileName}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <DialogFrame
      open={exporter.open}
      onClose={exporter.close}
      keepOpen={false}
      closable
      title="Export OpenAPI"
      description="A source as an OpenAPI document, from the definition Studio runs."
      icon={{ icon: FileJson, tone: "bg-brand-dim text-brand" }}
      width="w-180"
      footer={
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-panel-subtle px-5 py-3">
          <button
            type="button"
            disabled={!ready}
            onClick={() => void copy()}
            className="flex h-8 cursor-pointer items-center gap-1.75 rounded-card border border-line px-3.5 text-control text-fg-muted hover:border-line-strong hover:text-fg disabled:cursor-default disabled:opacity-50"
          >
            <Copy aria-hidden="true" className="size-3.25" />
            Copy
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => result && downloadFile(result.text, result.fileName)}
            className="flex h-8 cursor-pointer items-center gap-1.75 rounded-card bg-fg px-3.5 text-control font-semibold text-bg hover:bg-fg/90 disabled:cursor-default disabled:opacity-50"
          >
            <Download aria-hidden="true" className="size-3.25" />
            {result ? `Download ${result.fileName}` : "Download"}
          </button>
        </div>
      }
    >
      <ExportOpenApiForm exporter={exporter} sources={sources} />
    </DialogFrame>
  );
}
