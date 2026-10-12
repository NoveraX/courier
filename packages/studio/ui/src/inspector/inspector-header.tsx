import { Copy, Pin, RotateCcw, Square, Terminal, X } from "lucide-react";
import { Fragment } from "react";

import { methodChip } from "@/design/method-color";
import { OverflowMenu } from "@/design/overflow-menu";
import { endpointParts, httpMethodOf } from "@/features/requests/request-parts";
import { isStreamRequest } from "@/features/requests/request-state";
import { useTogglePin } from "@/hooks/use-toggle-pin";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import type { RequestEntry } from "@/store/types";
import { requestCopyActions } from "./request-copy-actions";
import type { Replay } from "./use-replay";

const TRANSPORT_CHIP: Readonly<Record<"http" | "sse" | "ws", string>> = {
  http: "bg-fg-subtle/12 text-fg-subtle",
  sse: "bg-brand/12 text-brand",
  ws: "bg-syntax-keyword/12 text-syntax-keyword",
};

const ACTION =
  "flex h-7 w-7.5 cursor-pointer items-center justify-center border-r border-line text-fg-muted transition-colors last:border-r-0 hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand disabled:cursor-default disabled:opacity-40 pointer-coarse:h-9 pointer-coarse:w-9";

interface InspectorHeaderProps {
  request: RequestEntry;
  replay: Replay;
  /** Stops a stream this page reconnected, while it is open. */
  stop: (() => void) | undefined;
  onClose: () => void;
}

/**
 * The inspector's head: the request's method, transport and mode, its
 * endpoint and URL — a click copies it — and its actions: pin it, replay
 * it when it can be, copy it as cURL, close the inspector, and the "⋯"
 * menu with every way to copy or download it. A phone's head copies it as
 * cURL from that menu alone, and lets a long name take a second line.
 *
 * @param props - The request, its replay, and what closes the inspector
 * @returns The head
 * @example
 * ```tsx
 * <InspectorHeader request={request} replay={replay} onClose={close} />
 * ```
 */
export function InspectorHeader({
  request,
  replay,
  stop,
  onClose,
}: InspectorHeaderProps): React.ReactNode {
  const togglePin = useTogglePin();
  const method = isStreamRequest(request) ? "GET" : httpMethodOf(request);
  const transport = request.transport ?? "http";
  const { prefix, name } = endpointParts(request);
  const copies = requestCopyActions(request);
  return (
    <div className="flex items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1.75">
        <div className="flex items-center gap-1.5">
          <Chip className={methodChip(method)}>{method}</Chip>
          <Chip className={TRANSPORT_CHIP[transport]}>
            {transport === "ws" ? "WS" : transport.toUpperCase()}
          </Chip>
          <span className="ml-0.5 text-label text-fg-subtle">
            {request.agent
              ? `agent tool ${request.agent.tool}`
              : request.mode === "proxy"
                ? "via proxy"
                : request.mode === "webhook"
                  ? "webhook delivered to the app"
                  : "direct"}
          </span>
        </div>
        <h2 className="m-0 truncate font-mono text-heading font-medium tracking-[-0.015em] max-sm:line-clamp-2 max-sm:whitespace-normal max-sm:[overflow-wrap:anywhere]">
          <span className="text-fg-subtle">{dottedBreaks(prefix)}</span>
          {dottedBreaks(name)}
        </h2>
        {request.url && (
          <button
            type="button"
            title="Copy URL"
            onClick={() => void copyToClipboard(request.url ?? "", "the URL")}
            className="relative flex min-w-0 cursor-copy items-center gap-1.5 text-left text-fg-subtle transition-colors hit-area hover:text-fg-muted"
          >
            <span className="truncate font-mono text-label">{request.url}</span>
            <Copy aria-hidden="true" className="size-2.75 shrink-0" />
          </button>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <div className="flex overflow-hidden rounded-card border border-line bg-panel-subtle">
          <button
            type="button"
            title={request.pinned ? "Unpin" : "Pin request"}
            aria-pressed={request.pinned === true}
            onClick={() => togglePin(request.id)}
            className={cn(
              ACTION,
              request.pinned && "text-syntax-keyword hover:text-syntax-keyword",
            )}
          >
            <Pin aria-hidden="true" className="size-3.25" />
          </button>
          {stop && (
            <button type="button" title="Stop the stream" onClick={stop} className={ACTION}>
              <Square aria-hidden="true" className="size-3" />
            </button>
          )}
          <button
            type="button"
            title={replay.title}
            aria-label={replay.label}
            disabled={!replay.run}
            onClick={replay.run}
            className={cn(ACTION, "max-sm:border-r-0")}
          >
            <RotateCcw aria-hidden="true" className="size-3.25" />
          </button>
          <button
            type="button"
            title="Copy as cURL"
            onClick={copies[0].onSelect}
            className={cn(ACTION, "max-sm:hidden")}
          >
            <Terminal aria-hidden="true" className="size-3.25" />
          </button>
        </div>
        <OverflowMenu label="Copy or download the request" actions={copies} />
        <button
          type="button"
          title="Close · Esc"
          aria-label="Close the inspector"
          onClick={onClose}
          className="flex size-7 cursor-pointer items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-brand pointer-coarse:size-9"
        >
          <X aria-hidden="true" className="size-3.75" />
        </button>
      </div>
    </div>
  );
}

function Chip({ className, children }: { className: string; children: string }): React.ReactNode {
  return (
    <span
      className={cn(
        "flex h-5 items-center rounded-[5px] px-1.5 font-mono text-meta font-semibold",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* A dotted name wraps after a dot before it wraps inside a word: `payments.charges.` above `create`. */
function dottedBreaks(text: string): React.ReactNode[] {
  let offset = 0;
  return text.split(".").map((part, at, parts) => {
    const start = offset;
    offset += part.length + 1;
    if (at === parts.length - 1) return part;
    return (
      <Fragment key={start}>
        {part}.<wbr />
      </Fragment>
    );
  });
}
