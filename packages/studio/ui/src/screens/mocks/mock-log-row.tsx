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
  slowMs: number;
  onOpen: () => void;
}

/**
 * A request in a mock's log: when it came, how it went, its method and
 * path, what answered it, its code and how long it took — opening its
 * sheet, with the answer, what it was asked with, the headers and a cURL.
 *
 * @param props - The request, whether its sheet is open, the slow threshold, and what opens it
 * @returns The row
 * @example
 * ```tsx
 * <MockLogRow log={log} selected={false} slowMs={500} onOpen={open} />
 * ```
 */
export function MockLogRow({ log, selected, slowMs, onOpen }: MockLogRowProps): React.ReactNode {
  const tone = log.status === undefined && log.error === undefined ? undefined : mockLogTone(log);
  const tag = logTag(log);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onOpen}
      className={cn(
        "grid h-8.5 w-full cursor-pointer grid-cols-[96px_48px_minmax(0,1fr)_110px_44px_64px] items-center gap-3 border-b border-line px-5 text-left font-mono text-small tabular-nums hover:bg-raised",
        selected && "bg-brand-tint",
      )}
    >
      <span className="text-fg-subtle">{formatAbsoluteTime(log.timestamp)}</span>
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
          log.duration === undefined
            ? "text-fg-subtle"
            : DURATION_TEXT[durationTone(log.duration, slowMs)],
        )}
      >
        {log.duration === undefined ? "—" : formatDuration(log.duration)}
      </span>
    </button>
  );
}
