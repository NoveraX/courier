import type { LucideIcon } from "lucide-react";
import { ArrowRight, Download, Loader2 } from "lucide-react";
import type { UseImportReturn } from "@/apis/use-import";
import { countSelectedEndpoints } from "@/features/apis/helpers";
import type { ImportState, ImportStep } from "@/features/apis/types";
import { cn } from "@/lib/utils";

const BUTTON =
  "flex h-8 shrink-0 cursor-pointer items-center gap-1.75 rounded-card px-3.5 text-control font-semibold disabled:cursor-default disabled:opacity-50";
const NEXT = `${BUTTON} bg-fg text-bg hover:bg-fg/90`;
const OUTLINE = `${BUTTON} border border-line font-normal text-fg-muted hover:border-line-strong hover:text-fg`;
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

function Action({
  label,
  icon: Icon,
  busy = false,
  className,
  disabled = false,
  onClick,
}: {
  label: string;
  icon?: LucideIcon;
  busy?: boolean;
  className: string;
  disabled?: boolean;
  onClick: () => void;
}): React.ReactNode {
  const Shown = busy ? Loader2 : Icon;
  return (
    <button type="button" className={className} disabled={disabled} onClick={onClick}>
      {Shown && <Shown aria-hidden="true" className={cn("size-3.25", busy && "animate-spin")} />}
      {label}
    </button>
  );
}

/**
 * The import's footer: where it stands, Back, and the step's next move —
 * Parse spec, Continue, Generate preview, the write (or its retry once
 * Studio refused it), or Done.
 *
 * @param props - The import
 * @returns The footer
 * @example
 * ```tsx
 * <ImportFooter wizard={wizard} />
 * ```
 */
export function ImportFooter({ wizard }: { wizard: UseImportReturn }): React.ReactNode {
  const { state, parsing } = wizard;
  const back = BACK[state.step];
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-line bg-panel-subtle px-5 py-3">
      <span className="truncate text-small text-fg-subtle">{noteOf(state)}</span>
      <div className="flex-1" />
      {back && (
        <Action
          label="Back"
          className={OUTLINE}
          disabled={state.writing}
          onClick={() => wizard.goToStep(back)}
        />
      )}
      {state.step === "import" && (
        <Action
          label="Parse spec"
          icon={ArrowRight}
          busy={parsing}
          className={NEXT}
          disabled={!state.content.trim() || parsing}
          onClick={() => void wizard.parse()}
        />
      )}
      {state.step === "select" && (
        <Action
          label="Continue"
          icon={ArrowRight}
          className={NEXT}
          disabled={countSelectedEndpoints(state.selectedEndpoints) === 0}
          onClick={() => wizard.goToStep("options")}
        />
      )}
      {state.step === "options" && (
        <Action
          label="Generate preview"
          icon={ArrowRight}
          busy={parsing}
          className={NEXT}
          disabled={parsing || !state.options.sourceName.trim()}
          onClick={() => void wizard.preview()}
        />
      )}
      {state.step === "preview" && (
        <Action
          label={writeLabel(state)}
          icon={Download}
          busy={state.writing}
          className={`${BUTTON} bg-brand text-bg hover:bg-brand/90`}
          disabled={state.writing}
          onClick={() => void wizard.write()}
        />
      )}
      {state.step === "declare" && <Action label="Done" className={NEXT} onClick={wizard.close} />}
    </div>
  );
}
