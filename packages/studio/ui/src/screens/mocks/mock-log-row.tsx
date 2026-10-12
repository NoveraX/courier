import { methodText } from "@/design/method-color";
import type { LogTag } from "@/features/mocks/logs-view";
import { logCode, logTag } from "@/features/mocks/logs-view";
import { mockLogTone } from "@/features/mocks/mock-log";
import { durationTone } from "@/features/requests/duration-tone";
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
const DURATION_TEXT = { normal: "text-fg-muted", warn: "text-warn", err: "text-err" } as const;

interface MockLogRowProps {
  log: MockRequestLog;
  /** Whether its sheet is open. */
  selected: boolean;
  /** Two lines in place of the columns, in a list too narrow for them. */
  stacked: boolean;
  slowMs: number;
  onOpen: () => void;
}

/**
 * A request in a mock's log: when it came, how it went, its method and
 * path, what answered it, its code and how long it took — in columns, or on
 * two lines in a narrow list: the method, path and code over the time, what
 * answered it and how long it took. It opens its sheet, with the answer,
 * what it was asked with, the headers and a cURL. The row fills the height
 * its list gives it.
 *
 * @param props - The request, whether its sheet is open, whether it is stacked, the slow threshold, and what opens it
 * @returns The row
 * @example
 * ```tsx
 * <MockLogRow log={log} selected={false} stacked={false} slowMs={500} onOpen={open} />
 * ```
 */
export function MockLogRow(props: MockLogRowProps): React.ReactNode {
  const { log, selected, stacked, slowMs, onOpen } = props;
  const tone = log.status === undefined && log.error === undefined ? undefined : mockLogTone(log);
  const tag = logTag(log);
  const method = log.httpMethod.toUpperCase();
  const cells = {
    time: <span className="text-fg-subtle">{formatAbsoluteTime(log.timestamp)}</span>,
    method: (
      <span className={cn("shrink-0 text-meta font-semibold", methodText(method))}>{method}</span>
    ),
    path: <span className="min-w-0 truncate">{log.path}</span>,
    tag: (
      <span
        className={cn(
          "flex h-4.75 shrink-0 items-center justify-self-start rounded-[5px] px-1.75 font-sans text-badge whitespace-nowrap",
          TAG[tag.tone],
        )}
      >
        {tag.tag}
      </span>
    ),
    code: (
      <span className={cn("shrink-0", tone ? TONE[tone] : "text-fg-subtle")}>{logCode(log)}</span>
    ),
    duration: (
      <span
        className={cn(
          "shrink-0 text-right",
          log.duration === undefined
            ? "text-fg-subtle"
            : DURATION_TEXT[durationTone(log.duration, slowMs)],
        )}
      >
        {log.duration === undefined ? "—" : formatDuration(log.duration)}
      </span>
    ),
  };
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onOpen}
      className={cn(
        "h-full w-full cursor-pointer border-b border-line text-left font-mono text-small tabular-nums hover:bg-raised",
        stacked
          ? "flex flex-col justify-center gap-1 px-4"
          : "grid grid-cols-[96px_48px_minmax(0,1fr)_110px_44px_64px] items-center gap-3 px-5",
        selected && "bg-brand-tint",
      )}
    >
      {stacked ? (
        <>
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="w-11 shrink-0">{cells.method}</span>
            <span className="flex min-w-0 flex-1">{cells.path}</span>
            {cells.code}
          </span>
          <span className="flex min-w-0 items-center gap-2.5 text-label">
            {cells.time}
            {cells.tag}
            <span className="flex-1" />
            {cells.duration}
          </span>
        </>
      ) : (
        <>
          {cells.time}
          {cells.method}
          {cells.path}
          {cells.tag}
          {cells.code}
          {cells.duration}
        </>
      )}
    </button>
  );
}
