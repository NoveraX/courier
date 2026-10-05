import { StepBar } from "@/design/step-bar";
import type { MockWizardState } from "@/features/mocks/wizard/types";

const STEPS = [
  { key: "source", label: "Sources" },
  { key: "configure", label: "Configure" },
  { key: "review", label: "Review" },
] as const;

interface GenerateStepsProps {
  state: MockWizardState;
  /** Whether an apply is in flight, when no step can be gone back to. */
  applying: boolean;
  onBack: (step: "source" | "configure") => void;
}

/**
 * The mock wizard's steps — Sources, Configure, Review — filled up to the
 * one in hand; Sources and Configure go back to, until the change is
 * applied.
 *
 * @param props - The wizard, whether an apply is in flight, and what going back does
 * @returns The steps
 * @example
 * ```tsx
 * <GenerateSteps state={state} applying={false} onBack={(step) => dispatch({ type: "goTo", step })} />
 * ```
 */
export function GenerateSteps({ state, applying, onBack }: GenerateStepsProps): React.ReactNode {
  const current =
    state.step === "done" ? STEPS.length : STEPS.findIndex((step) => step.key === state.step);
  return (
    <StepBar
      steps={STEPS}
      current={current}
      canGoBack={(key) => key !== "review" && state.step !== "done" && !applying}
      onBack={(key) => key !== "review" && onBack(key)}
    />
  );
}
