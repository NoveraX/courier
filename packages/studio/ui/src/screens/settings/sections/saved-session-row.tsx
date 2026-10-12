import { Archive, Download, FlaskConical, FolderOpen, Share, Trash2 } from "lucide-react";
import { useState } from "react";

import { shortAgo } from "@/features/explorer/endpoint-key";
import type { SessionSummary } from "@/features/settings/session-summary";
import { cn } from "@/lib/utils";

const ICON_BUTTON =
  "flex size-7 cursor-pointer items-center justify-center rounded-control text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-brand pointer-coarse:size-9";
/* In a list too narrow for one line, the actions take a line under the name. */
const ROW =
  "grid min-h-12.5 grid-cols-[30px_minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-line px-3 py-1.5 last:border-b-0 @max-[25rem]:grid-cols-[30px_minmax(0,1fr)_auto] @max-[25rem]:gap-y-2 @max-[25rem]:py-2.5";

interface SavedSessionRowProps {
  session: SessionSummary;
  now: number;
  onLoad: () => void;
  onExport: () => void;
  /** Share it as a session file, looked over first. */
  onShare: () => void;
  /** Save it as a test, planned first. */
  onTest: () => void;
  onDelete: () => void;
}

/**
 * A saved session: its name, how many requests and when it was saved, its
 * errors, and Load, Export, Share, Save as a test and Delete — Delete asking
 * first. In a narrow list the actions take a line under the name.
 *
 * @param props - The session, the time now, and what loads, exports, shares, tests and deletes it
 * @returns The row
 * @example
 * ```tsx
 * <SavedSessionRow session={s} now={Date.now()} onLoad={load} onExport={exp} onShare={share} onTest={test} onDelete={del} />
 * ```
 */
export function SavedSessionRow({
  session,
  now,
  onLoad,
  onExport,
  onShare,
  onTest,
  onDelete,
}: SavedSessionRowProps): React.ReactNode {
  const [asking, setAsking] = useState(false);
  const errors = session.stats.errorCount;
  if (asking) {
    return (
      <li className="flex min-h-12.5 flex-wrap items-center gap-2.5 border-b border-line bg-err-dim px-3 py-1.5 text-control last:border-b-0">
        <span className="min-w-50 flex-1">{`Delete "${session.name}" from disk?`}</span>
        <button
          type="button"
          onClick={() => setAsking(false)}
          className="h-7 cursor-pointer rounded-control border border-line-strong bg-panel px-2.5 text-small pointer-coarse:h-9"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="h-7 cursor-pointer rounded-control bg-err px-3 text-small font-semibold text-bg pointer-coarse:h-9"
        >
          Delete session
        </button>
      </li>
    );
  }
  return (
    <li className={ROW}>
      <span className="flex size-7.5 items-center justify-center rounded-card bg-raised text-fg-subtle">
        <Archive aria-hidden="true" className="size-3.25" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-control font-strong">{session.name}</span>
        <span className="font-mono text-badge text-fg-subtle">{`${session.stats.totalRequests} requests · saved ${shortAgo(now - session.savedAt)} ago`}</span>
      </span>
      <span
        className={cn(
          "font-mono text-badge whitespace-nowrap",
          errors > 0 ? "text-err" : "text-fg-subtle",
        )}
      >
        {errors > 0 ? `${errors} error${errors === 1 ? "" : "s"}` : "no errors"}
      </span>
      <span className="flex gap-1 @max-[25rem]:col-span-2 @max-[25rem]:col-start-2">
        <button
          type="button"
          title="Load"
          aria-label={`Load ${session.name}`}
          onClick={onLoad}
          className={cn(ICON_BUTTON, "border border-line")}
        >
          <FolderOpen aria-hidden="true" className="size-3" />
        </button>
        <button
          type="button"
          title="Export"
          aria-label={`Export ${session.name}`}
          onClick={onExport}
          className={cn(ICON_BUTTON, "border border-line")}
        >
          <Download aria-hidden="true" className="size-3" />
        </button>
        <button
          type="button"
          title="Share as a session file"
          aria-label={`Share ${session.name} as a session file`}
          onClick={onShare}
          className={cn(ICON_BUTTON, "border border-line")}
        >
          <Share aria-hidden="true" className="size-3" />
        </button>
        <button
          type="button"
          title="Save as a test"
          aria-label={`Save ${session.name} as a test`}
          onClick={onTest}
          className={cn(ICON_BUTTON, "border border-line")}
        >
          <FlaskConical aria-hidden="true" className="size-3" />
        </button>
        <button
          type="button"
          title="Delete"
          aria-label={`Delete ${session.name}`}
          onClick={() => setAsking(true)}
          className={cn(ICON_BUTTON, "hover:bg-err-dim hover:text-err")}
        >
          <Trash2 aria-hidden="true" className="size-3" />
        </button>
      </span>
    </li>
  );
}
