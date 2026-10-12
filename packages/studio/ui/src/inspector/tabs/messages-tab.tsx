import { CircleCheck, Unplug } from "lucide-react";
import { useState } from "react";

import { CodeLines } from "@/design/code/code-lines";
import { tokenizeJsonLine } from "@/design/code/tokenize-json-line";
import { streamEnding, streamSparkline } from "@/features/requests/stream-activity";
import { streamMessages, streamStats } from "@/features/requests/stream-summary";
import { useSessionEnd } from "@/features/sessions/use-session-end";
import { useNow } from "@/hooks/use-tick";
import { formatAbsoluteTime, formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { RequestEntry } from "@/store/types";
import { MessageList } from "./message-list";

const STAT_TONE = { brand: "text-brand", ok: "text-ok", normal: "text-fg" } as const;

function pretty(preview: string): string {
  try {
    return JSON.stringify(JSON.parse(preview), null, 2);
  } catch {
    return preview;
  }
}

/**
 * A stream's messages: how it ended once it has, its figures, how its
 * messages spread over time, the list of them, and the one chosen in full.
 *
 * @param props - The stream
 * @returns The tab
 * @example
 * ```tsx
 * <MessagesTab request={stream} />
 * ```
 */
export function MessagesTab({ request }: { request: RequestEntry }): React.ReactNode {
  const clock = useNow();
  const now = useSessionEnd() ?? clock;
  const [chosen, setChosen] = useState<number | undefined>(undefined);
  const messages = streamMessages(request);
  const message = messages.find((m) => m.seq === chosen) ?? messages[0];
  const ending = streamEnding(request, now);
  const { heights, span } = streamSparkline(request, now);
  const live = ending === null;
  return (
    <div className="flex flex-col gap-3.5 px-4.5 pt-4.5 pb-7">
      {ending && (
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-[9px] border px-3 py-2.5 text-control",
            ending.failed ? "border-err/30 bg-err/8" : "border-ok/30 bg-ok/8",
          )}
        >
          {ending.failed ? (
            <Unplug aria-hidden="true" className="size-3.5 text-err" />
          ) : (
            <CircleCheck aria-hidden="true" className="size-3.5 text-ok" />
          )}
          <span className="font-strong">{ending.title}</span>
          <span className="truncate text-fg-muted">{ending.detail}</span>
        </div>
      )}
      <dl className="m-0 grid grid-cols-4 gap-px overflow-hidden rounded-panel border border-line bg-line max-sm:grid-cols-2">
        {streamStats(request, now).map((stat) => (
          <div key={stat.label} className="flex flex-col gap-1.25 bg-inset px-3 py-2.5">
            <dt className="text-meta text-fg-subtle">{stat.label}</dt>
            <dd className={cn("m-0 font-mono text-title font-medium", STAT_TONE[stat.tone])}>
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2 rounded-panel border border-line px-3 pt-3 pb-2.5">
        <div className="flex items-center">
          <span className="text-label text-fg-subtle">Throughput</span>
          <span className="flex-1" />
          <span className="font-mono text-meta text-fg-subtle">
            −{formatDuration(span)} → {live ? "now" : "close"}
          </span>
        </div>
        <div aria-hidden="true" className="flex h-11 items-end gap-0.5">
          {heights.map((height, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: a span of time's place is its identity
              key={i}
              className={cn(
                "min-h-0.5 flex-1 rounded-[1.5px]",
                live && i === heights.length - 1 ? "bg-brand" : "bg-brand/50",
              )}
              style={{ height: `${height * 100}%` }}
            />
          ))}
        </div>
      </div>
      <MessageList
        request={request}
        messages={messages}
        chosen={message?.seq}
        onChoose={setChosen}
      />
      {message && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h3 className="m-0 text-label font-semibold text-fg-muted">Message #{message.seq}</h3>
            <span className="text-label text-fg-subtle">
              {message.type} · {message.size} B · {formatAbsoluteTime(message.at)}
              {message.truncated && " · only its start was kept"}
            </span>
          </div>
          <div className="overflow-hidden rounded-panel border border-line bg-inset">
            <CodeLines variant="panel" code={pretty(message.preview)} tokenize={tokenizeJsonLine} />
          </div>
        </section>
      )}
    </div>
  );
}
