import { Loader2, Wand2 } from "lucide-react";
import { useState } from "react";

import { ChangePreview } from "@/design/code/change-preview";
import { DialogFrame } from "@/design/dialog-frame";
import { applySchemaFix } from "@/features/contract/apply-schema-fix";
import type { LeftDifference } from "@/features/contract/schema-fix-preview";
import { useSchemaFixDialog } from "@/features/contract/schema-fix-store";
import {
  type FixPreviewState,
  useSchemaFixPreview,
} from "@/features/contract/use-schema-fix-preview";

function Notice({
  tone,
  children,
}: {
  tone: "err" | "muted";
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <p
      role={tone === "err" ? "alert" : undefined}
      className={
        tone === "err"
          ? "m-0 rounded-panel bg-err-dim px-3 py-2.5 text-control text-err"
          : "m-0 rounded-panel bg-inset px-3 py-2.5 text-control text-fg-muted"
      }
    >
      {children}
    </p>
  );
}

function LeftList({ left }: { left: readonly LeftDifference[] }): React.ReactNode {
  if (left.length === 0) return null;
  return (
    <section aria-label="Left as they are" className="flex flex-col gap-1.5">
      <h3 className="m-0 text-label font-semibold text-fg-muted">Left for you to change</h3>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {left.map((difference) => (
          <li key={difference.path} className="text-small text-fg-muted">
            <code className="font-mono text-fg">{difference.path || "the answer"}</code> —{" "}
            {difference.why}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Body({ state }: { state: FixPreviewState }): React.ReactNode {
  if (state.kind === "failed") return <Notice tone="err">{state.message}</Notice>;
  if (state.kind === "loading") {
    return (
      <p className="flex items-center justify-center gap-2 py-8 text-control text-fg-subtle">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        Studio is finding where the schema is written…
      </p>
    );
  }
  const { preview } = state;
  if (preview.status === "manual") {
    return (
      <>
        <Notice tone="muted">{preview.reason}</Notice>
        <LeftList left={preview.left} />
      </>
    );
  }
  return (
    <>
      {preview.files.map((file) => (
        <ChangePreview key={file.file} target={file.file} hunks={file.hunks} />
      ))}
      <LeftList left={preview.left} />
    </>
  );
}

/**
 * The change that makes an endpoint's response schema take the answers
 * Studio saw, shown as a diff of the files it is written in, and Apply,
 * which writes it — only while it is still the change shown — runs the
 * config again, and offers Undo. What Studio cannot change is listed with
 * why.
 *
 * @returns The dialog, open while an endpoint's fix is shown
 * @example
 * ```tsx
 * <SchemaFixDialog />
 * ```
 */
export function SchemaFixDialog(): React.ReactNode {
  const target = useSchemaFixDialog((s) => s.target);
  const [attempt, setAttempt] = useState(0);
  const [applying, setApplying] = useState(false);
  const state = useSchemaFixPreview(target, attempt);
  const ready =
    state.kind === "shown" && state.preview.status === "ready" ? state.preview : undefined;
  const close = () => useSchemaFixDialog.setState({ target: null });
  const apply = async () => {
    if (!target || !ready) return;
    setApplying(true);
    const outcome = await applySchemaFix(target, ready.digest);
    setApplying(false);
    if (outcome === "applied") close();
    if (outcome === "changed") setAttempt((n) => n + 1);
  };
  return (
    <DialogFrame
      open={target !== null}
      onClose={() => !applying && close()}
      keepOpen={applying}
      closable={!applying}
      title="Fix the response schema"
      description={
        target
          ? `So ${target.source}.${target.endpoint}'s schema takes the answers Studio saw.`
          : undefined
      }
      icon={{ icon: Wand2, tone: "bg-brand-dim text-brand" }}
      width="w-180"
      footer={
        <div className="flex shrink-0 items-center gap-3 border-t border-line bg-panel-subtle px-5 py-3">
          <span className="flex-1 text-small text-fg-subtle">
            {ready &&
              "Studio runs the config again once it is written, and puts it back if it does not load."}
          </span>
          <button
            type="button"
            disabled={applying}
            onClick={close}
            className="flex h-8 cursor-pointer items-center rounded-card border border-line px-3.5 text-control text-fg-muted hover:border-line-strong hover:text-fg disabled:cursor-default disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready || applying}
            onClick={() => void apply()}
            className="flex h-8 cursor-pointer items-center gap-1.75 rounded-card bg-brand px-3.5 text-control font-semibold text-bg hover:bg-brand/90 disabled:cursor-default disabled:opacity-50"
          >
            {applying && <Loader2 aria-hidden="true" className="size-3.25 animate-spin" />}
            Apply the change
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Body state={state} />
      </div>
    </DialogFrame>
  );
}
