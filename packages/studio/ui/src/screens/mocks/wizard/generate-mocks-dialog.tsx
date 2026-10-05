import { Sparkles, X } from "lucide-react";
import { Dialog } from "radix-ui";

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
  const keep = applying || (state.step !== "done" && state.drafts.length > 0);
  return (
    <Dialog.Root open={wizard.open} onOpenChange={(open) => (open ? undefined : wizard.close())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[3px]" />
        <Dialog.Content
          data-shell=""
          onInteractOutside={(event) => keep && event.preventDefault()}
          onEscapeKeyDown={(event) => keep && event.preventDefault()}
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100vh-48px)] w-185 max-w-[calc(100vw-48px)] -translate-x-1/2 -translate-y-1/2 animate-pop-in flex-col overflow-hidden rounded-[16px] bg-panel shadow-overlay outline-none"
        >
          <div className="flex shrink-0 flex-col gap-3.5 border-b border-line px-5 pt-4.5 pb-3.5">
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-[9px] bg-brand-dim text-brand">
                <Sparkles aria-hidden="true" className="size-3.75" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Dialog.Title className="text-prompt font-semibold">Generate mocks</Dialog.Title>
                <Dialog.Description className="text-small text-fg-subtle">
                  Mock your API sources in courier.mocks.ts — Studio shows the exact change before
                  it writes it
                </Dialog.Description>
              </div>
              {!applying && (
                <Dialog.Close
                  aria-label="Close Generate mocks"
                  className="flex size-7 cursor-pointer items-center justify-center rounded-control text-fg-subtle hover:bg-raised hover:text-fg"
                >
                  <X aria-hidden="true" className="size-3.75" />
                </Dialog.Close>
              )}
            </div>
            <GenerateSteps
              state={state}
              applying={applying}
              onBack={(step) => session.dispatch({ type: "goTo", step })}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-5">
            <StepBody wizard={wizard} />
          </div>
          <GenerateFooter wizard={wizard} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
