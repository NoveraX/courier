import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reviewCta } from "@/features/mocks/wizard/review-cta";
import type { MockWizardHandle } from "@/mocks/wizard/use-mock-wizard";
import { ApplyButton } from "./apply-button";

const PRIMARY =
  "h-7 gap-1.5 bg-accent-brand px-3 text-xs font-medium text-white hover:bg-accent-brand/90";
const OUTLINE = "h-7 gap-1.5 text-xs";

function ReviewActions({ wizard }: { wizard: MockWizardHandle }): React.ReactElement {
  const { session } = wizard;
  const cta = reviewCta(wizard.state);
  switch (cta.kind) {
    case "wait":
      return (
        <Button type="button" size="sm" className={PRIMARY} disabled>
          <Loader2 className="size-3 animate-spin" />
          {cta.label}
        </Button>
      );
    case "apply":
      return (
        <ApplyButton
          label={cta.label}
          armedAt={cta.armedAt}
          className={PRIMARY}
          onApply={() => session.apply()}
        />
      );
    case "checkAgain":
      return (
        <Button type="button" size="sm" className={PRIMARY} onClick={() => session.review()}>
          {cta.label}
        </Button>
      );
    case "close":
      return (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={OUTLINE}
          onClick={wizard.close}
        >
          {cta.label}
        </Button>
      );
  }
}

function StepActions({ wizard }: { wizard: MockWizardHandle }): React.ReactElement {
  const { state, session, availability, errors } = wizard;
  switch (state.step) {
    case "source": {
      const ready =
        state.mode === "sources" && availability.kind === "sources" && state.drafts.length > 0;
      return (
        <Button
          type="button"
          size="sm"
          className={PRIMARY}
          disabled={!ready}
          onClick={() => session.dispatch({ type: "goTo", step: "configure" })}
        >
          Continue
        </Button>
      );
    }
    case "configure":
      return (
        <Button
          type="button"
          size="sm"
          className={PRIMARY}
          disabled={errors.size > 0 || state.drafts.length === 0}
          onClick={() => session.review()}
        >
          Review change
        </Button>
      );
    case "review":
      return <ReviewActions wizard={wizard} />;
    case "done":
      return (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={OUTLINE}
          onClick={wizard.close}
        >
          Close
        </Button>
      );
  }
}

/**
 * The wizard's footer: Back, and each step's call to action. A ready plan
 * is applied only by its own button, which is never a form's submit and
 * turns on only once the plan has been on screen for a moment, and Back is
 * off while an apply is in flight.
 *
 * @param props.wizard - The wizard
 * @returns The footer
 *
 * @example
 * ```tsx
 * <WizardFooter wizard={wizard} />
 * ```
 */
export function WizardFooter({ wizard }: { wizard: MockWizardHandle }): React.ReactElement {
  const { state, session } = wizard;
  const back = state.step === "configure" ? "source" : state.step === "review" ? "configure" : null;
  const count = state.drafts.length;
  return (
    <div className="flex items-center justify-between rounded-b-lg border-t border-border-subtle bg-muted px-6 py-3">
      <div>
        {back && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={OUTLINE}
            disabled={state.apply.status === "applying"}
            onClick={() => session.dispatch({ type: "goTo", step: back })}
          >
            Back
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {state.step === "source" && state.mode === "sources" && (
          <span className="text-body-sm tabular-nums text-muted-foreground">
            {count} source{count !== 1 ? "s" : ""} selected
          </span>
        )}
        <StepActions wizard={wizard} />
      </div>
    </div>
  );
}
