import { Sparkles } from "lucide-react";

import { DialogFrame } from "@/design/dialog-frame";

import type { MockWizardHandle } from "@/mocks/wizard/use-mock-wizard";
import { ConfigureStep } from "./configure-step";
import { DoneStep } from "./done-step";
import { GenerateFooter } from "./generate-footer";
import { GenerateSteps } from "./generate-steps";
import { ReviewStep } from "./review-step";
import { SourceStep } from "./source-step";

function StepBody({ wizard }: { wizard: MockWizardHandle }): React.ReactNode {
  const { state, session } = wizard;
  switch (state.step) {
    case "source":
      return (
        <SourceStep
          availability={wizard.availability}
          sources={wizard.sources}
          drafts={state.drafts}
          onToggle={wizard.toggleSource}
        />
      );
    case "configure":
      return (
        <ConfigureStep
          state={state}
          errors={wizard.errors}
          onEdit={(index, patch) => session.dispatch({ type: "editDraft", index, patch })}
          onRemove={(index) => session.dispatch({ type: "removeDraft", index })}
        />
      );
    case "review":
      return <ReviewStep state={state} />;
    case "done":
      return state.apply.status === "applied" ? (
        <DoneStep applied={state.apply} connected={wizard.connected} />
      ) : null;
  }
}

/**
 * Generate mocks: the dialog that declares mocks of the project's sources
 * in courier.mocks.ts — pick the sources, configure each mock, review
 * Studio's exact change and apply it, then watch the mocks appear. It
 * cannot be closed while an apply is in flight, and while it holds mocks
 * not yet added a click outside or Esc leaves it open: they would go with
 * it, and a stray click can land there.
 *
 * @param props - The wizard from `useMockWizard`
 * @returns The dialog
 * @example
 * ```tsx
 * const wizard = useMockWizard();
 * <GenerateMocksDialog wizard={wizard} />
 * ```
 */
export function GenerateMocksDialog({ wizard }: { wizard: MockWizardHandle }): React.ReactNode {
  const { state, session } = wizard;
  const applying = state.apply.status === "applying";
  return (
    <DialogFrame
      open={wizard.open}
      onClose={wizard.close}
      keepOpen={applying || (state.step !== "done" && state.drafts.length > 0)}
      closable={!applying}
      title="Generate mocks"
      description="Mock your API sources in courier.mocks.ts — Studio shows the exact change before it writes it"
      icon={{ icon: Sparkles, tone: "bg-brand-dim text-brand" }}
      width="w-185"
      header={
        <GenerateSteps
          state={state}
          applying={applying}
          onBack={(step) => session.dispatch({ type: "goTo", step })}
        />
      }
      footer={<GenerateFooter wizard={wizard} />}
    >
      <StepBody wizard={wizard} />
    </DialogFrame>
  );
}
