import { CodeLines } from "@/design/code/code-lines";
import { tokenizeJsonLine } from "@/design/code/tokenize-json-line";
import { methodText } from "@/design/method-color";
import type { LogTag } from "@/features/mocks/logs-view";
import { logCode, logTag } from "@/features/mocks/logs-view";
import { mockLogTone } from "@/features/mocks/mock-log";
import { formatAbsoluteTime, formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { MockRequestLog } from "@/store/mock-slice";

const TAG: Readonly<Record<LogTag["tone"], string>> = {
  err: "bg-err-dim text-err",
  warn: "bg-warn-dim text-warn",
  keyword: "bg-syntax-keyword/12 text-syntax-keyword",
  subtle: "bg-raised text-fg-subtle",
};
const TONE = { ok: "text-ok", warn: "text-warn", err: "text-err" } as const;
const DOT = { ok: "bg-ok", warn: "bg-warn", err: "bg-err" } as const;

function durationTone(ms: number, slowMs: number): string {
  if (ms > slowMs * 2) return "text-err";
  return ms > slowMs ? "text-warn" : "text-fg-muted";
}

/* What the request was answered with: its body, else its failure. */
function answerOf(log: MockRequestLog): string | undefined {
  if (log.data !== undefined) return JSON.stringify(log.data, null, 2);
  return log.error === undefined ? undefined : JSON.stringify({ error: log.error }, null, 2);
}

function Block({ title, code }: { title: string; code: string }): React.ReactNode {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-badge text-fg-subtle">{title}</span>
      <div className="max-h-80 overflow-auto rounded-panel border border-line bg-inset">
        <CodeLines code={code} tokenize={tokenizeJsonLine} variant="panel" />
      </div>
    </div>
  );
}

interface MockLogRowProps {
  log: MockRequestLog;
  open: boolean;
  slowMs: number;
  onToggle: () => void;
}

/**
 * A request a mock answered, on one line — when, its status, method and
 * path, what answered it, its code and how long it took — and, open, what
 * it was answered with and the variables it sent.
 *
 * @param props - The request, whether it is open, the slow threshold, and what toggles it
 * @returns The row
 * @example
 * ```tsx
 * <MockLogRow log={log} open={false} slowMs={500} onToggle={toggle} />
 * ```
 */
export function MockLogRow({ log, open, slowMs, onToggle }: MockLogRowProps): React.ReactNode {
  const tone = log.status === undefined && log.error === undefined ? undefined : mockLogTone(log);
  const tag = logTag(log);
  const answer = answerOf(log);
  const sent = log.variables === undefined ? undefined : JSON.stringify(log.variables, null, 2);
  return (
    <div className="border-b border-line">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={cn(
          "grid h-8.5 w-full cursor-pointer grid-cols-[96px_8px_48px_minmax(0,1fr)_110px_44px_64px] items-center gap-3 px-5 text-left font-mono text-small tabular-nums hover:bg-raised",
          open && "bg-brand-tint",
        )}
      >
        <span className="text-fg-subtle">{formatAbsoluteTime(log.timestamp)}</span>
        <span className={cn("size-1.75 rounded-full", tone ? DOT[tone] : "bg-fg-subtle")} />
        <span className={cn("text-meta font-semibold", methodText(log.httpMethod.toUpperCase()))}>
          {log.httpMethod.toUpperCase()}
        </span>
        <span className="truncate">{log.path}</span>
        <span
          className={cn(
            "flex h-4.75 items-center justify-self-start rounded-[5px] px-1.75 font-sans text-badge whitespace-nowrap",
            TAG[tag.tone],
          )}
        >
          {tag.tag}
        </span>
        <span className={tone ? TONE[tone] : "text-fg-subtle"}>{logCode(log)}</span>
        <span
          className={cn(
            "text-right",
            log.duration === undefined ? "text-fg-subtle" : durationTone(log.duration, slowMs),
          )}
        >
          {log.duration === undefined ? "—" : formatDuration(log.duration)}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 bg-bg-subtle pt-1 pr-5 pb-3.5 pl-[136px]">
          {answer ? (
            <Block title="Response" code={answer} />
          ) : (
            <p className="text-small text-fg-subtle">Waiting for the answer…</p>
          )}
          {sent && sent !== "{}" && <Block title="Variables" code={sent} />}
        </div>
      )}
    </div>
  );
}
