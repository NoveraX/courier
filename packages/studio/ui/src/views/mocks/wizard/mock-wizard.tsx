import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfigureStep } from "./step-configure";
import { DoneStep } from "./step-done";
import { ReviewStep } from "./step-review";
import { SourceStep } from "./step-source";
import type { MockWizardHandle } from "./use-mock-wizard";
import { WizardFooter } from "./wizard-footer";
import { WizardStepDot } from "./wizard-step-dot";

const STEPS = [
  { key: "source", label: "Sources" },
  { key: "configure", label: "Configure" },
  { key: "review", label: "Review" },
] as const;

function StepBody({ wizard }: { wizard: MockWizardHandle }): React.ReactElement | null {
  const { state, session } = wizard;
  switch (state.step) {
    case "source":
      return (
        <SourceStep
          state={state}
          availability={wizard.availability}
          sources={wizard.sources}
          onModeChange={(mode) => session.dispatch({ type: "setMode", mode })}
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
 * The dialog that declares mocks of the project's sources in
 * `courier.mocks.ts`: pick sources, configure each mock, review Studio's
 * exact change and apply it on one click, then watch the mocks appear.
 * While an apply is in flight the dialog cannot be closed, and while it
 * holds drafts not yet added a click outside it does not close it: the
 * drafts would go with it, and a stray click — the second of a double
 * click on a button that moved — can land there.
 *
 * @param props.wizard - The wizard from `useMockWizard`
 * @returns The dialog
 *
 * @example
 * ```tsx
 * const wizard = useMockWizard();
 * <MockWizard wizard={wizard} />
 * ```
 */
export function MockWizard({ wizard }: { wizard: MockWizardHandle }): React.ReactElement {
  const { state, session } = wizard;
  const applying = state.apply.status === "applying";
  const holdsDrafts = state.step !== "done" && state.drafts.length > 0;
  const current =
    state.step === "done" ? STEPS.length : STEPS.findIndex((step) => step.key === state.step);

  return (
    <Dialog open={wizard.open} onOpenChange={(open) => (open ? undefined : wizard.close())}>
      <DialogContent
        showCloseButton={!applying}
        className="flex max-h-[85vh] flex-col p-0 sm:max-w-3xl"
        onInteractOutside={(event) => {
          if (holdsDrafts) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (holdsDrafts) event.preventDefault();
        }}
      >
        <DialogHeader className="px-6 pt-5">
          <DialogTitle className="text-h2">Add mock server</DialogTitle>
          <DialogDescription className="text-body-sm">
            Declare mocks of your API sources in courier.mocks.ts. Studio shows the exact change
            before it writes it.
          </DialogDescription>
          <div className="flex items-center gap-0 pt-3">
            {STEPS.map(({ key, label }, index) => {
              const back =
                key === "review" || index >= current || state.step === "done" || applying
                  ? null
                  : key;
              return (
                <WizardStepDot
                  key={key}
                  label={label}
                  index={index}
                  active={index === current}
                  completed={index < current}
                  onClick={back ? () => session.dispatch({ type: "goTo", step: back }) : undefined}
                />
              );
            })}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          <StepBody wizard={wizard} />
        </div>

        <WizardFooter wizard={wizard} />
      </DialogContent>
    </Dialog>
  );
}
