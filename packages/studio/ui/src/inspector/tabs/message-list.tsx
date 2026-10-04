import { ArrowDownLeft, ArrowUpRight, Dot } from "lucide-react";

import type { StreamMessage } from "@/features/requests/stream-summary";
import { cn } from "@/lib/utils";
import type { RequestEntry } from "@/store/types";

const DIRECTION = {
  sent: { icon: ArrowUpRight, tone: "text-brand" },
  received: { icon: ArrowDownLeft, tone: "text-ok" },
  event: { icon: Dot, tone: "text-brand" },
} as const;

interface MessageListProps {
  request: RequestEntry;
  messages: readonly StreamMessage[];
  chosen: number | undefined;
  onChoose: (seq: number) => void;
}

/**
 * A stream's messages, newest first — a WebSocket's marked sent or
 * received — the one chosen highlighted.
 *
 * @param props - The stream, its messages, the one chosen, and what chooses
 * @returns The list
 * @example
 * ```tsx
 * <MessageList request={stream} messages={messages} chosen={seq} onChoose={setSeq} />
 * ```
 */
export function MessageList({
  request,
  messages,
  chosen,
  onChoose,
}: MessageListProps): React.ReactNode {
  const total = Math.max(request.streamEventCount ?? 0, messages.length);
  const ws = request.transport === "ws";
  return (
    <section className="overflow-hidden rounded-panel border border-line">
      <div className="flex h-9 items-center gap-2.5 border-b border-line bg-panel-subtle px-3">
        <h3 className="m-0 text-control font-semibold">Messages</h3>
        <span className="inline-flex h-4 min-w-4.5 items-center justify-center rounded-full bg-raised px-1.25 text-meta text-fg-subtle tabular-nums">
          {total}
        </span>
        <span className="flex-1" />
        {total > messages.length && (
          <span className="text-badge text-fg-subtle">the last {messages.length} kept</span>
        )}
        {ws && (
          <span className="flex gap-2.5 text-badge text-fg-subtle">
            <span className="flex items-center gap-1">
              <ArrowUpRight aria-hidden="true" className="size-2.75 text-brand" />
              sent
            </span>
            <span className="flex items-center gap-1">
              <ArrowDownLeft aria-hidden="true" className="size-2.75 text-ok" />
              received
            </span>
          </span>
        )}
      </div>
      <div className="max-h-62.5 overflow-auto font-mono text-label">
        {messages.length === 0 && (
          <p className="m-0 px-3 py-3.5 font-sans text-small text-fg-subtle">No message yet.</p>
        )}
        {messages.map((message) => {
          const { icon: Icon, tone } = DIRECTION[message.direction];
          const on = message.seq === chosen;
          return (
            <button
              key={message.seq}
              type="button"
              aria-pressed={on}
              onClick={() => onChoose(message.seq)}
              className={cn(
                "relative grid h-7.75 w-full cursor-pointer grid-cols-[14px_38px_118px_minmax(0,1fr)_52px] items-center gap-2.5 border-b border-line px-3 text-left last:border-b-0 hover:bg-raised",
                on && "bg-brand-dim",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-y-0 left-0 w-0.5",
                  on ? "bg-brand" : "bg-transparent",
                )}
              />
              <span className="flex">
                <Icon aria-hidden="true" className={cn("size-2.75", tone)} />
                <span className="sr-only">{message.direction}</span>
              </span>
              <span className="text-fg-subtle">#{message.seq}</span>
              <span className="truncate text-syntax-keyword">{message.type}</span>
              <span className="truncate text-fg-muted">{message.preview}</span>
              <span className="text-right text-fg-subtle">
                +{(message.offset / 1000).toFixed(1)}s
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
