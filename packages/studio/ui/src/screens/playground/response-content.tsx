import { LoaderCircle, Send } from "lucide-react";

import { MEDIA } from "@/design/breakpoints";
import { Kbd } from "@/design/kbd";
import { entryPayloadView } from "@/features/playground/entry-view";
import { notForwardedOf } from "@/features/playground/not-forwarded";
import { responseView } from "@/features/requests/payload-view";
import { requestStateOf } from "@/features/requests/request-state";
import { useMediaQuery } from "@/hooks/use-media-query";
import { requestWhole } from "@/inspector/request-whole";
import { HeadersTab } from "@/inspector/tabs/headers-tab";
import { MessagesTab } from "@/inspector/tabs/messages-tab";
import type { PayloadMode } from "@/inspector/tabs/payload-tab";
import { PayloadTab } from "@/inspector/tabs/payload-tab";
import { TimingTab } from "@/inspector/tabs/timing-tab";
import { formatDuration } from "@/lib/formatters";
import type { RequestEntry } from "@/store/types";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";
import { WsComposer } from "./ws-composer";

export type ResponseTab = "body" | "headers" | "timing" | "messages";

function Centered({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <div className="flex h-full min-h-65 flex-col items-center justify-center gap-3 p-6 text-center">
      {children}
    </div>
  );
}

function Waiting({ text }: { text: string }): React.ReactNode {
  return (
    <Centered>
      <span className="text-control text-fg-subtle">{text}</span>
    </Centered>
  );
}

/* A touch screen has no ⌘↵ to press: it is told of the button alone. */
function Invitation(): React.ReactNode {
  const touch = useMediaQuery(MEDIA.coarse);
  return (
    <Centered>
      <span className="flex size-11 items-center justify-center rounded-dialog border border-line-strong bg-panel text-fg-subtle">
        <Send aria-hidden="true" className="size-4.5" />
      </span>
      <span className="text-title font-semibold">Send a request to see the response</span>
      <span className="flex items-center gap-1.5 text-control text-fg-subtle">
        {touch ? (
          "Use the Send button"
        ) : (
          <>
            Press <Kbd>⌘ ↵</Kbd> or use the Send button
          </>
        )}
      </span>
    </Centered>
  );
}

function Failed({ reason }: { reason: string }): React.ReactNode {
  return (
    <Centered>
      <span role="alert" className="max-w-120 text-control break-words text-err">
        {reason}
      </span>
    </Centered>
  );
}

interface ResponseContentProps {
  entry: PlaygroundHistoryEntry | null;
  row: RequestEntry | undefined;
  tab: ResponseTab;
  payload: { mode: PayloadMode; onMode: (mode: PayloadMode) => void };
  now: number;
  /** What a call in flight says it is doing: `POST https://…/orders`. */
  sendingLabel: string;
  /** Give up on a call in flight. */
  onCancel: () => void;
}

/**
 * What the response pane shows: an invitation before anything is sent, a
 * counter while a call is in flight, then the answer — its body, headers
 * and timing, or a stream's messages with a composer for a WebSocket —
 * shown as the inspector shows a request, from the request the run made.
 * Its headers add the ones the run wrote that a proxy did not pass on.
 *
 * @param props - The run, the request it made, the tab, the body's view mode, the time, the in-flight label and what cancels it
 * @returns The content
 * @example
 * ```tsx
 * <ResponseContent entry={entry} row={row} tab="body" payload={payload} now={now} sendingLabel={label} onCancel={cancel} />
 * ```
 */
export function ResponseContent(props: ResponseContentProps): React.ReactNode {
  const { entry, row, tab, payload, now, sendingLabel, onCancel } = props;
  if (!entry) return <Invitation />;
  const stream = entry.transport !== undefined;
  if (!stream && entry.status === "pending" && (!row || requestStateOf(row) === "pending")) {
    return (
      <Centered>
        <LoaderCircle aria-hidden="true" className="size-5.5 animate-spin text-brand" />
        <span className="font-mono text-ui text-fg-muted">
          {formatDuration(Math.max(0, now - entry.timestamp))}
        </span>
        <span className="text-small text-fg-subtle">
          {entry.upload ? `Uploading · ${entry.upload.percentage}%` : sendingLabel}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="h-6.5 cursor-pointer rounded-[6px] px-2.25 text-small text-fg-subtle hover:bg-raised hover:text-fg pointer-coarse:h-9 pointer-coarse:px-3"
        >
          Cancel
        </button>
      </Centered>
    );
  }
  const reported = "Shown once the runtime reports the call.";
  if (tab === "headers") {
    if (!row) return <Waiting text={reported} />;
    const forwarded = row.mode === "proxy" ? row.requestHeaders : undefined;
    return <HeadersTab request={row} notForwarded={notForwardedOf(entry.headers, forwarded)} />;
  }
  if (stream) {
    const live = row ? requestStateOf(row) === "streaming" : entry.streamStatus === "streaming";
    const failure =
      entry.status === "error" && typeof entry.response === "string" ? entry.response : undefined;
    return (
      <div className="flex min-h-full flex-col">
        <div className="flex-1">
          {row ? (
            <MessagesTab request={row} />
          ) : failure ? (
            <Failed reason={failure} />
          ) : (
            <Waiting text="Connecting…" />
          )}
        </div>
        {entry.transport === "ws" && live && <WsComposer rid={entry.rid} />}
      </div>
    );
  }
  if (tab === "timing") return row ? <TimingTab request={row} /> : <Waiting text={reported} />;
  return (
    <PayloadTab
      view={row ? responseView(row) : entryPayloadView(entry)}
      mode={payload.mode}
      onMode={payload.onMode}
      whole={row ? requestWhole(row, "response") : undefined}
      searchLabel="Find in the answer"
    />
  );
}
