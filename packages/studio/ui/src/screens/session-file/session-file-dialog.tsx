import { Download, Loader2, Share, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { DialogFrame } from "@/design/dialog-frame";
import type { SessionFileDraft } from "@/features/sessions/session-file";
import { downloadSessionFile, sessionFileName } from "@/features/sessions/session-file";
import { useSessionFileDialog } from "@/features/sessions/session-file-dialog-store";
import type { DraftState } from "@/features/sessions/use-session-file-draft";
import { useSessionFileDraft } from "@/features/sessions/use-session-file-draft";
import { EnvironmentList } from "./environment-list";
import { RedactionList } from "./redaction-list";

function close(): void {
  useSessionFileDialog.setState({ target: null });
}

function Contents({ draft }: { draft: SessionFileDraft }): React.ReactNode {
  const replaced = draft.redactions.length;
  return (
    <div className="flex flex-col gap-4.5">
      <div className="flex items-center gap-3 rounded-panel bg-inset px-3.5 py-2.5">
        <span className="min-w-0 truncate font-mono text-small">{sessionFileName(draft.name)}</span>
        <span className="ml-auto shrink-0 text-small text-fg-subtle tabular-nums">
          {draft.requests} request{draft.requests === 1 ? "" : "s"}
          {draft.failed > 0 && <span className="text-err"> · {draft.failed} failed</span>}
        </span>
      </div>
      <section aria-label="Left out" className="flex flex-col gap-2">
        <h4 className="m-0 flex items-center gap-1.5 text-small font-strong">
          <ShieldCheck aria-hidden="true" className="size-3.25 text-ok" />
          Left out
        </h4>
        <p className="m-0 text-small text-fg-muted">
          Credential headers — Authorization, Cookie, Set-Cookie, API keys — are never saved.
          {replaced > 0 &&
            ` ${replaced} value${replaced === 1 ? " is" : "s are"} replaced with [redacted], since ${replaced === 1 ? "its name says it holds" : "their names say they hold"} a secret:`}
        </p>
        <RedactionList redactions={draft.redactions} />
        <p className="m-0 text-small text-fg-subtle">
          A secret in a field with an ordinary name stays in: look the bodies over before you share
          the file.
        </p>
      </section>
      <section aria-label="Recorded on" className="flex flex-col gap-2">
        <h4 className="m-0 text-small font-strong">Recorded on</h4>
        <EnvironmentList environment={draft.environment} />
      </section>
    </div>
  );
}

function Body({ state }: { state: DraftState }): React.ReactNode {
  if (state.kind === "ready") return <Contents draft={state.draft} />;
  if (state.kind === "failed") {
    return (
      <p role="alert" className="m-0 rounded-panel bg-err-dim px-3 py-2.5 text-control text-err">
        Could not write the session file: {state.message}
      </p>
    );
  }
  return (
    <p className="flex items-center justify-center gap-2 py-10 text-control text-fg-subtle">
      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      Studio is writing the session file…
    </p>
  );
}

/**
 * A session file looked over before it is saved: its name and how many
 * requests it holds, what was left out of it — the values replaced, each
 * by its request and place — and the environment it names. Download saves
 * exactly the file shown.
 *
 * @returns The dialog, open while a session file is asked for
 * @example
 * ```tsx
 * <SessionFileDialog />
 * ```
 */
export function SessionFileDialog(): React.ReactNode {
  const target = useSessionFileDialog((s) => s.target);
  const state = useSessionFileDraft(target);
  const save = (draft: SessionFileDraft) => {
    downloadSessionFile(draft);
    toast.success(`Saved ${sessionFileName(draft.name)}`);
    close();
  };
  return (
    <DialogFrame
      open={target !== null}
      onClose={close}
      keepOpen={false}
      closable
      title="Share as a session file"
      description="A colleague opens it in their Studio and sees what you saw."
      icon={{ icon: Share, tone: "bg-brand-dim text-brand" }}
      width="w-160"
      footer={
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-panel-subtle px-5 py-3">
          <button
            type="button"
            onClick={close}
            className="flex h-8 cursor-pointer items-center rounded-card border border-line px-3.5 text-control text-fg-muted hover:border-line-strong hover:text-fg"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={state.kind !== "ready"}
            onClick={() => state.kind === "ready" && save(state.draft)}
            className="flex h-8 cursor-pointer items-center gap-1.75 rounded-card bg-brand px-3.5 text-control font-semibold text-bg hover:bg-brand/90 disabled:cursor-default disabled:opacity-50"
          >
            <Download aria-hidden="true" className="size-3.25" />
            Download
          </button>
        </div>
      }
    >
      <Body state={state} />
    </DialogFrame>
  );
}
