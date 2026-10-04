import { Copy, Pin, RotateCcw, Terminal, X } from "lucide-react";

import { methodChip } from "@/design/method-color";
import { endpointParts, httpMethodOf } from "@/features/requests/request-parts";
import { requestSnippet } from "@/features/requests/request-snippets";
import { isStreamRequest } from "@/features/requests/request-state";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import type { RequestEntry } from "@/store/types";

const TRANSPORT_CHIP: Readonly<Record<"http" | "sse" | "ws", string>> = {
  http: "bg-fg-subtle/12 text-fg-subtle",
  sse: "bg-brand/12 text-brand",
  ws: "bg-syntax-keyword/12 text-syntax-keyword",
};

const ACTION =
  "flex h-7 w-7.5 cursor-pointer items-center justify-center border-r border-line text-fg-muted transition-colors last:border-r-0 hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand disabled:cursor-default disabled:opacity-40";

interface InspectorHeaderProps {
  request: RequestEntry;
  onReplay: (() => void) | undefined;
  onClose: () => void;
}

/**
 * The inspector's head: the request's method, transport and mode, its
 * endpoint and URL — a click copies it — and its actions: pin it, replay
 * it when it can be, copy it as cURL, close the inspector.
 *
 * @param props - The request, what replays it, and what closes the inspector
 * @returns The head
 * @example
 * ```tsx
 * <InspectorHeader request={request} onReplay={replay} onClose={close} />
 * ```
 */
export function InspectorHeader({
  request,
  onReplay,
  onClose,
}: InspectorHeaderProps): React.ReactNode {
  const togglePin = useStudioStore((s) => s.togglePin);
  const method = isStreamRequest(request) ? "GET" : httpMethodOf(request);
  const transport = request.transport ?? "http";
  const { prefix, name } = endpointParts(request);
  const copyCurl = () => void copyToClipboard(requestSnippet(request, "shell").code, "as cURL");
  return (
    <div className="flex items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1.75">
        <div className="flex items-center gap-1.5">
          <Chip className={methodChip(method)}>{method}</Chip>
          <Chip className={TRANSPORT_CHIP[transport]}>
            {transport === "ws" ? "WS" : transport.toUpperCase()}
          </Chip>
          <span className="ml-0.5 text-label text-fg-subtle">
            {request.mode === "proxy" ? "via proxy" : "direct"}
          </span>
        </div>
        <h2 className="m-0 truncate font-mono text-heading font-medium tracking-[-0.015em]">
          <span className="text-fg-subtle">{prefix}</span>
          {name}
        </h2>
        {request.url && (
          <button
            type="button"
            title="Copy URL"
            onClick={() => void copyToClipboard(request.url ?? "", "the URL")}
            className="flex min-w-0 cursor-copy items-center gap-1.5 text-left text-fg-subtle transition-colors hover:text-fg-muted"
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
          <button
            type="button"
            title={onReplay ? "Replay request" : "A stream cannot be replayed from Studio"}
            disabled={!onReplay}
            onClick={onReplay}
            className={ACTION}
          >
            <RotateCcw aria-hidden="true" className="size-3.25" />
          </button>
          <button type="button" title="Copy as cURL" onClick={copyCurl} className={ACTION}>
            <Terminal aria-hidden="true" className="size-3.25" />
          </button>
        </div>
        <button
          type="button"
          title="Close · Esc"
          aria-label="Close the inspector"
          onClick={onClose}
          className="flex size-7 cursor-pointer items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-brand"
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
