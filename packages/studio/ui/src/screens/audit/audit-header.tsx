import { ClipboardCopy, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import type { AuditReport } from "@/audit/use-audit-report";
import { exportAsMarkdown } from "@/features/audit/export-report";
import { shortAgo } from "@/features/explorer/endpoint-key";
import { copyToClipboard } from "@/lib/clipboard";
import { downloadFile } from "@/lib/export";

const BUTTON =
  "flex h-8 cursor-pointer items-center gap-1.75 rounded-card px-3 text-control whitespace-nowrap focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-default disabled:opacity-50";
const OUTLINE = `${BUTTON} border border-line bg-panel text-fg-muted hover:border-line-strong hover:text-fg`;

interface AuditHeaderProps {
  report: AuditReport;
  /** Requests captured since the report ran. */
  newSince: number;
  now: number;
  onRerun: () => void;
}

function analysedAgo(at: number, now: number): string {
  return now - at < 10_000 ? "analysed just now" : `analysed ${shortAgo(now - at)} ago`;
}

/**
 * The Audit page's head: what the report read and when — with the
 * requests that came since — and Re-run, Copy report and Export .md.
 *
 * @param props - The report, the traffic since, the time now, and what runs it again
 * @returns The header
 * @example
 * ```tsx
 * <AuditHeader report={report} newSince={3} now={Date.now()} onRerun={rerun} />
 * ```
 */
export function AuditHeader({ report, newSince, now, onRerun }: AuditHeaderProps): React.ReactNode {
  const empty = report.requests === 0;
  const markdown = (): string => exportAsMarkdown(report.result);
  const download = (): void => {
    downloadFile(markdown(), "courier-audit.md", "text/markdown");
    toast.success("Downloaded courier-audit.md");
  };
  return (
    <header className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="m-0 text-page font-semibold tracking-[-0.025em]">Audit</h1>
        <span className="text-control text-fg-subtle">
          {`${report.requests} requests · ${report.endpoints} endpoints · ${analysedAgo(report.at, now)}`}
          {newSince > 0 && <span className="text-brand">{` · ${newSince} new since`}</span>}
        </span>
      </div>
      <div className="flex-1" />
      <button type="button" onClick={onRerun} className={OUTLINE}>
        <RefreshCw aria-hidden="true" className="size-3.25" />
        Re-run
      </button>
      <button
        type="button"
        disabled={empty}
        onClick={() => void copyToClipboard(markdown(), "report")}
        className={OUTLINE}
      >
        <ClipboardCopy aria-hidden="true" className="size-3.25" />
        Copy report
      </button>
      <button
        type="button"
        disabled={empty}
        onClick={download}
        className={`${BUTTON} bg-fg font-semibold text-bg hover:bg-fg/90`}
      >
        <Download aria-hidden="true" className="size-3.25" />
        Export .md
      </button>
    </header>
  );
}
