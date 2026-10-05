import type { LucideIcon } from "lucide-react";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { diffStats } from "@/features/mocks/wizard/diff-stats";
import { reviewCta } from "@/features/mocks/wizard/review-cta";
import type { MockWizardState } from "@/features/mocks/wizard/types";
import { cn } from "@/lib/utils";
import type { MockWizardHandle } from "@/mocks/wizard/use-mock-wizard";
import { useTimeReached } from "@/mocks/wizard/use-time-reached";

const BUTTON =
  "flex h-8 shrink-0 cursor-pointer items-center gap-1.75 rounded-card px-3.5 text-control font-semibold disabled:cursor-default disabled:opacity-50";
const NEXT = `${BUTTON} bg-fg text-bg hover:bg-fg/90`;
const OUTLINE = `${BUTTON} border border-line font-normal text-fg-muted hover:border-line-strong hover:text-fg`;

function Action({
  label,
  icon: Icon,
  className,
  disabled = false,
  onClick,
}: {
  label: string;
  icon?: LucideIcon;
  className: string;
  disabled?: boolean;
  onClick?: () => void;
}): React.ReactNode {
  return (
    <button type="button" className={className} disabled={disabled} onClick={onClick}>
      {Icon && (
        <Icon aria-hidden="true" className={cn("size-3.25", Icon === Loader2 && "animate-spin")} />
      )}
      {label}
    </button>
  );
}

function ApplyAction({
  label,
  armedAt,
  onApply,
}: {
  label: string;
  armedAt: number;
  onApply: () => void;
}): React.ReactNode {
  const armed = useTimeReached(armedAt);
  return (
    <Action
      label={label}
      icon={Sparkles}
      className={`${BUTTON} bg-brand text-bg hover:bg-brand/90`}
      disabled={!armed}
      onClick={onApply}
    />
  );
}

function ReviewAction({ wizard }: { wizard: MockWizardHandle }): React.ReactNode {
  const cta = reviewCta(wizard.state);
  switch (cta.kind) {
    case "wait":
      return <Action label={cta.label} icon={Loader2} className={NEXT} disabled />;
    case "apply":
      return (
        <ApplyAction
          label={cta.label}
          armedAt={cta.armedAt}
          onApply={() => wizard.session.apply()}
        />
      );
    case "checkAgain":
      return <Action label={cta.label} className={NEXT} onClick={() => wizard.session.review()} />;
    case "close":
      return <Action label={cta.label} className={OUTLINE} onClick={wizard.close} />;
  }
}

function noteOf(state: MockWizardState): string {
  const count = state.drafts.length;
  if (state.step === "source") return `${count} source${count === 1 ? "" : "s"} selected`;
  if (state.step === "configure") return `${count} mock${count === 1 ? "" : "s"} to declare`;
  if (state.step === "done" && state.apply.status === "applied")
    return `Added to ${state.apply.target}`;
  if (state.plan.status !== "ready") return state.plan.status === "manual" ? "To add by hand" : "";
  const { added, removed } = diffStats(state.plan.outcome.hunks);
  return `+${added} −${removed} in ${state.plan.outcome.target}`;
}

/**
 * The wizard's footer: where it stands, Back, and the step's next move —
 * Continue, Review change, the change applied once Studio's plan has been
 * on screen a moment, Check again, or Close.
 *
 * @param props - The wizard
 * @returns The footer
 * @example
 * ```tsx
 * <GenerateFooter wizard={wizard} />
 * ```
 */
export function GenerateFooter({ wizard }: { wizard: MockWizardHandle }): React.ReactNode {
  const { state, session, availability, errors } = wizard;
  const back = state.step === "configure" ? "source" : state.step === "review" ? "configure" : null;
  const ready = availability.kind === "sources" && state.drafts.length > 0;
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-line bg-panel-subtle px-5 py-3">
      <span className="truncate text-small text-fg-subtle">{noteOf(state)}</span>
      <div className="flex-1" />
      {back && (
        <Action
          label="Back"
          className={OUTLINE}
          disabled={state.apply.status === "applying"}
          onClick={() => session.dispatch({ type: "goTo", step: back })}
        />
      )}
      {state.step === "source" && (
        <Action
          label="Continue"
          icon={ArrowRight}
          className={NEXT}
          disabled={!ready}
          onClick={() => session.dispatch({ type: "goTo", step: "configure" })}
        />
      )}
      {state.step === "configure" && (
        <Action
          label="Review change"
          icon={ArrowRight}
          className={NEXT}
          disabled={errors.size > 0 || state.drafts.length === 0}
          onClick={() => session.review()}
        />
      )}
      {state.step === "review" && <ReviewAction wizard={wizard} />}
      {state.step === "done" && <Action label="Close" className={OUTLINE} onClick={wizard.close} />}
    </div>
  );
}
