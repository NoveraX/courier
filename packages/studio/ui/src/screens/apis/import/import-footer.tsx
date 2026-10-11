import { ArrowRight, Download } from "lucide-react";
import type { UseConfigDeclare } from "@/apis/use-config-declare";
import type { UseImportReturn } from "@/apis/use-import";
import { countSelectedEndpoints } from "@/features/apis/helpers";
import type { ImportState, ImportStep } from "@/features/apis/types";
import { DeclareActions } from "./declare-actions";
import { FooterAction } from "./footer-action";

const BACK: Partial<Record<ImportStep, ImportStep>> = {
  select: "import",
  options: "select",
  preview: "options",
};

/* A write Studio refused names what the next one does: allowed steps, or a fresh plan once blocked files are dealt with. */
function writeLabel({ consent, generatedFiles }: ImportState): string {
  if (consent === null)
    return `Write ${generatedFiles.length} file${generatedFiles.length === 1 ? "" : "s"}`;
  return consent.plan.blocked.length > 0 ? "Try again" : "Write as allowed";
}

function noteOf(state: ImportState): string {
  if (state.step === "import") return "OpenAPI 3.x · Swagger 2.0 · Postman";
  if (state.step === "select")
    return `${countSelectedEndpoints(state.selectedEndpoints)} endpoints will be generated`;
  if (state.step === "options")
    return `${state.options.validation === "none" ? "No" : state.options.validation} validation · grouped by ${state.options.groupBy}`;
  if (state.step === "preview")
    return `${state.generatedFiles.length} files for ${state.options.sourceName}`;
  return "Written";
}

/**
 * The import's footer: where it stands, Back, and the step's next move —
 * Parse spec, Continue, Generate preview, the write (or its retry once
 * Studio refused it), then adding the import to courier.config, or Done.
 *
 * @param props - The import, and declaring it in courier.config
 * @returns The footer
 * @example
 * ```tsx
 * <ImportFooter wizard={wizard} declare={declare} />
 * ```
 */
export function ImportFooter({
  wizard,
  declare,
}: {
  wizard: UseImportReturn;
  declare: UseConfigDeclare;
}): React.ReactNode {
  const { state, parsing } = wizard;
  const back = BACK[state.step];
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-line bg-panel-subtle px-5 py-3">
      <span className="truncate text-small text-fg-subtle">{noteOf(state)}</span>
      <div className="flex-1" />
      {back && (
        <FooterAction
          label="Back"
          tone="outline"
          disabled={state.writing}
          onClick={() => wizard.goToStep(back)}
        />
      )}
      {state.step === "import" && (
        <FooterAction
          label="Parse spec"
          icon={ArrowRight}
          busy={parsing}
          tone="next"
          disabled={!state.content.trim() || parsing}
          onClick={() => void wizard.parse()}
        />
      )}
      {state.step === "select" && (
        <FooterAction
          label="Continue"
          icon={ArrowRight}
          tone="next"
          disabled={countSelectedEndpoints(state.selectedEndpoints) === 0}
          onClick={() => wizard.goToStep("options")}
        />
      )}
      {state.step === "options" && (
        <FooterAction
          label="Generate preview"
          icon={ArrowRight}
          busy={parsing}
          tone="next"
          disabled={parsing || !state.options.sourceName.trim()}
          onClick={() => void wizard.preview()}
        />
      )}
      {state.step === "preview" && (
        <FooterAction
          label={writeLabel(state)}
          icon={Download}
          busy={state.writing}
          tone="brand"
          disabled={state.writing}
          onClick={() => void wizard.write()}
        />
      )}
      {state.step === "declare" && <DeclareActions declare={declare} onClose={wizard.close} />}
    </div>
  );
}
