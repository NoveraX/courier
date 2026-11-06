import { AlertTriangle, ListPlus, Loader2 } from "lucide-react";

import { ChangePreview } from "@/design/code/change-preview";
import { DialogFrame } from "@/design/dialog-frame";
import type { DeclarePreview } from "@/features/mocks/wizard/wire-types";
import type { AddToMock } from "@/mocks/use-add-to-mock";
import { ApplyOutcome } from "./wizard/apply-outcome";
import { ManualPlan } from "./wizard/review-plans";
import { WarningNotes } from "./wizard/wizard-notes";

/* What a plan of the edit is: the change to confirm, why it is left to the developer, or what cannot be asked. */
function Plan({ plan, stale }: { plan: DeclarePreview; stale: boolean }): React.ReactNode {
  if (plan.status === "manual") return <ManualPlan outcome={plan} />;
  if (plan.status === "invalid") {
    return (
      <ul
        role="alert"
        className="m-0 flex list-none flex-col gap-1 rounded-panel bg-err-dim px-3 py-2.5 p-0"
      >
        {plan.errors.map((error) => (
          <li key={`${error.field}:${error.message}`} className="text-small text-err">
            {error.message}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="flex flex-col gap-3.5">
      {stale && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-panel bg-warn-dim px-3 py-2.5 text-small text-warn"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
          The project changed after the last preview. This is the change against it as it is now.
        </p>
      )}
      <ChangePreview target={plan.target} hunks={plan.hunks} />
      <WarningNotes warnings={plan.warnings} />
      <p className="text-small text-fg-subtle">
        After writing, Studio loads the file and checks the mock lists the endpoints; if it does
        not, it puts the file back as it was.
      </p>
    </div>
  );
}

function Body({ add }: { add: AddToMock }): React.ReactNode {
  const { state } = add;
  if (state.step === "planning") {
    return (
      <p className="flex items-center gap-2 text-small text-fg-subtle">
        <Loader2 aria-hidden="true" className="size-3.25 animate-spin" />
        Studio is planning the change…
      </p>
    );
  }
  if (state.step === "planned" || state.step === "applying") {
    return <Plan plan={state.plan} stale={state.step === "planned" && state.stale} />;
  }
  if (state.step === "failed") {
    return (
      <p role="alert" className="rounded-panel bg-err-dim px-3 py-2.5 text-small text-err">
        {`Studio could not change the mock: ${state.message}`}
      </p>
    );
  }
  if (state.step !== "ended") return null;
  const { result } = state;
  if (result.status === "manual" || result.status === "invalid")
    return <Plan plan={result} stale={false} />;
  if (
    result.status === "rolledBack" ||
    result.status === "notVerified" ||
    result.status === "rollbackFailed"
  )
    return <ApplyOutcome outcome={result} target={result.target} />;
  return null;
}

/**
 * Add to mock: the change to `courier.mocks.ts` that adds endpoints to the
 * list a mock answers, previewed as a diff and made only as shown — or,
 * where Studio leaves it to the developer, why and the names to add by hand.
 *
 * @param props - What drives it
 * @returns The dialog
 * @example
 * ```tsx
 * <AddToMockDialog add={add} />
 * ```
 */
export function AddToMockDialog({ add }: { add: AddToMock }): React.ReactNode {
  const { state } = add;
  const asked = state.step === "closed" ? undefined : state.asked;
  const applying = state.step === "applying";
  const ready = state.step === "planned" && state.plan.status === "ready";
  const names = asked?.endpoints.join(", ") ?? "";
  return (
    <DialogFrame
      open={asked !== undefined}
      onClose={() => !applying && add.close()}
      keepOpen={applying}
      closable={!applying}
      title={`Add to ${asked?.key ?? "the mock"}`}
      description={`So ${asked?.key ?? "the mock"} answers ${names} itself, rather than your server.`}
      icon={{ icon: ListPlus, tone: "bg-brand-dim text-brand" }}
      width="w-160"
      footer={
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line bg-panel-subtle px-5 py-3">
          <button
            type="button"
            disabled={applying}
            onClick={add.close}
            className="flex h-8 cursor-pointer items-center rounded-card border border-line px-3.5 text-control text-fg-muted hover:border-line-strong hover:text-fg disabled:cursor-default disabled:opacity-50 pointer-coarse:h-10"
          >
            {ready || applying ? "Cancel" : "Close"}
          </button>
          {(ready || applying) && (
            <button
              type="button"
              disabled={applying}
              onClick={add.apply}
              className="flex h-8 cursor-pointer items-center gap-1.75 rounded-card bg-brand px-3.5 text-control font-semibold text-bg hover:bg-brand/90 disabled:cursor-default disabled:opacity-50 pointer-coarse:h-10"
            >
              {applying && <Loader2 aria-hidden="true" className="size-3.25 animate-spin" />}
              Add to mock
            </button>
          )}
        </div>
      }
    >
      <Body add={add} />
    </DialogFrame>
  );
}
