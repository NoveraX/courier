import { GitCompare, Loader2, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";

import type { ReuploadState } from "@/apis/parse-raw-spec";
import type { UseManageReturn } from "@/apis/use-manage";
import { DialogFrame } from "@/design/dialog-frame";
import { StepBar } from "@/design/step-bar";
import { InventoryStep } from "./inventory-step";
import { ManageFooter } from "./manage-footer";
import { ManagePreviewStep } from "./manage-preview-step";
import { ReuploadStep } from "./reupload-step";

const STEPS = [
  { key: "spec", label: "Spec" },
  { key: "endpoints", label: "Endpoints" },
  { key: "review", label: "Review" },
] as const;
const EMPTY: ReuploadState = { content: "", parsing: false, error: null };

function stepIndex(step: UseManageReturn["step"]): number {
  if (step === "reupload") return 0;
  return step === "preview" || step === "applying" ? 2 : 1;
}

function Body({
  manage,
  reupload,
  onContent,
}: {
  manage: UseManageReturn;
  reupload: ReuploadState;
  onContent: (content: string) => void;
}): React.ReactNode {
  if (manage.step === "loading") {
    return (
      <p className="flex items-center justify-center gap-2 py-12 text-control text-fg-subtle">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        Reading the spec…
      </p>
    );
  }
  if (manage.step === "reupload")
    return <ReuploadStep state={reupload} onContentChange={onContent} />;
  if (manage.step === "inventory" && manage.inventory)
    return (
      <InventoryStep
        inventory={manage.inventory}
        toAdd={manage.toAdd}
        toRemove={manage.toRemove}
        onToggle={manage.toggleEndpoint}
        onToggleGroup={manage.toggleGroup}
        onToggleAll={manage.toggleAll}
      />
    );
  if ((manage.step === "preview" || manage.step === "applying") && manage.preview)
    return (
      <ManagePreviewStep
        preview={manage.preview}
        consent={manage.consent}
        onToggleConfirmed={manage.toggleConfirmed}
      />
    );
  return null;
}

/**
 * Manage an import: the endpoints it generates and the ones its spec
 * offers now — a review of what changed when the spec did — then the
 * files Studio will touch, applied on one click.
 *
 * @param props - The manage flow from `useManage`
 * @returns The dialog
 * @example
 * ```tsx
 * const manage = useManage(onApplied);
 * <ManageDialog manage={manage} />
 * ```
 */
export function ManageDialog({ manage }: { manage: UseManageReturn }): React.ReactNode {
  const [reupload, setReupload] = useState<ReuploadState>(EMPTY);
  /* Each opening starts from an empty spec, not the one given for another import. */
  useEffect(() => {
    if (manage.open) setReupload(EMPTY);
  }, [manage.open]);
  const changed = manage.inventory?.specChanged ?? false;
  const applying = manage.step === "applying";
  return (
    <DialogFrame
      open={manage.open}
      onClose={() => !applying && manage.close()}
      keepOpen={applying || manage.hasChanges}
      closable={!applying}
      title={changed ? `Review update · ${manage.sourceName}` : `Manage ${manage.sourceName}`}
      description={
        changed
          ? "The spec changed since it was imported"
          : "The endpoints it generates, and the ones its spec offers"
      }
      icon={
        changed
          ? { icon: GitCompare, tone: "bg-warn-dim text-warn" }
          : { icon: Settings2, tone: "bg-brand-dim text-brand" }
      }
      width="w-180"
      header={
        <StepBar
          steps={STEPS}
          current={stepIndex(manage.step)}
          canGoBack={(key) =>
            !applying &&
            (key === "endpoints"
              ? stepIndex(manage.step) === 2
              : stepIndex(manage.step) === 1 && manage.importType !== "url")
          }
          onBack={() => manage.back()}
        />
      }
      footer={
        manage.step === "loading" || manage.step === "done" ? null : (
          <ManageFooter
            manage={manage}
            reupload={reupload}
            onReupload={(update) => setReupload((prev) => ({ ...prev, ...update }))}
          />
        )
      }
    >
      {manage.error && (
        <p
          role="alert"
          className="m-0 mb-3 rounded-panel bg-err-dim px-3 py-2.5 text-control text-err"
        >
          {manage.error}
        </p>
      )}
      <Body
        manage={manage}
        reupload={reupload}
        onContent={(content) => setReupload((prev) => ({ ...prev, content }))}
      />
    </DialogFrame>
  );
}
