import { FlaskConical, Loader2 } from "lucide-react";
import { useState } from "react";

import { DialogFrame } from "@/design/dialog-frame";
import { FIELD_INPUT } from "@/design/form-field";
import { TickBox } from "@/design/tick-box";
import { useRecordedTestDialog } from "@/features/tests/recorded-test-store";
import { type PlanState, useRecordedTestPlan } from "@/features/tests/use-recorded-test-plan";
import { writeRecordedTest } from "@/features/tests/write-recorded-test";
import { cn } from "@/lib/utils";
import { PlanChecks } from "./plan-checks";
import { PlanDetails } from "./plan-details";

/* Where Studio saves recorded tests unless told otherwise, beside what `courier-studio verify` reads. */
const DEFAULT_FOLDER = "tests/recorded";

function Body({ state }: { state: PlanState }): React.ReactNode {
  if (state.kind === "failed") {
    return (
      <p role="alert" className="m-0 rounded-panel bg-err-dim px-3 py-2.5 text-control text-err">
        {state.message}
      </p>
    );
  }
  if (state.kind !== "ready") {
    return (
      <p className="flex items-center justify-center gap-2 py-8 text-control text-fg-subtle">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        Studio is checking the calls against your definition…
      </p>
    );
  }
  return (
    <>
      <PlanChecks checks={state.plan.checks} calls={state.plan.calls} />
      <PlanDetails plan={state.plan} />
    </>
  );
}

/**
 * Save the requests as a test: a name and a folder, the calls checked
 * against the definition as it is now, the recordings and the vitest file
 * Studio writes — the test shown as it will be written — and Write, which
 * replaces a file already there only when that is ticked.
 *
 * @returns The dialog, open while requests are being saved as a test
 * @example
 * ```tsx
 * <RecordedTestDialog />
 * ```
 */
export function RecordedTestDialog(): React.ReactNode {
  const target = useRecordedTestDialog((s) => s.target);
  const [title, setTitle] = useState("");
  const [folder, setFolder] = useState(DEFAULT_FOLDER);
  const [replace, setReplace] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [writing, setWriting] = useState(false);
  const state = useRecordedTestPlan(target, { title, folder }, attempt);
  const plan = state.kind === "ready" ? state.plan : undefined;
  const replaces = plan?.files.some((file) => file.replaces) ?? false;
  const close = () => {
    useRecordedTestDialog.setState({ target: null });
    setReplace(false);
    setTitle("");
  };
  const write = async () => {
    if (!target || !plan) return;
    setWriting(true);
    const outcome = await writeRecordedTest(target, { title, folder }, plan, replace);
    setWriting(false);
    if (outcome === "written") close();
    if (outcome === "changed") setAttempt((n) => n + 1);
  };
  return (
    <DialogFrame
      open={target !== null}
      onClose={() => !writing && close()}
      keepOpen={writing}
      closable={!writing}
      title="Save as a test"
      description="Each call checked against your API definition, in CI and on your machine."
      icon={{ icon: FlaskConical, tone: "bg-brand-dim text-brand" }}
      width="w-180"
      footer={
        <div className="flex shrink-0 items-center gap-3 border-t border-line bg-panel-subtle px-5 py-3">
          {replaces && (
            <TickBox
              checked={replace}
              label="Replace the files already there"
              onChange={() => setReplace((on) => !on)}
            />
          )}
          <span className="flex-1" />
          <button
            type="button"
            disabled={writing}
            onClick={close}
            className="flex h-8 cursor-pointer items-center rounded-card border border-line px-3.5 text-control text-fg-muted hover:border-line-strong hover:text-fg disabled:cursor-default disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!plan || writing || (replaces && !replace)}
            onClick={() => void write()}
            className="flex h-8 cursor-pointer items-center gap-1.75 rounded-card bg-brand px-3.5 text-control font-semibold text-bg hover:bg-brand/90 disabled:cursor-default disabled:opacity-50"
          >
            {writing && <Loader2 aria-hidden="true" className="size-3.25 animate-spin" />}
            Write the test
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4.5">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <label className="flex flex-col gap-1 text-small text-fg-muted">
            Name
            <input
              id="recorded-test-title"
              value={title}
              placeholder={plan?.title ?? "Recorded requests"}
              onChange={(event) => setTitle(event.target.value)}
              className={cn(FIELD_INPUT, "max-w-none font-sans")}
            />
          </label>
          <label className="flex flex-col gap-1 text-small text-fg-muted">
            Folder
            <input
              id="recorded-test-folder"
              value={folder}
              onChange={(event) => setFolder(event.target.value)}
              className={cn(FIELD_INPUT, "max-w-none")}
            />
          </label>
        </div>
        <Body state={state} />
      </div>
    </DialogFrame>
  );
}
