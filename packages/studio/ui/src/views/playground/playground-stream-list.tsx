import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { useCallback, useState } from "react";

import { highlightLine } from "@/components/shared/detail-panel/tabs/syntax-highlight";
import { buttonProps } from "@/lib/button-props";
import { cn } from "@/lib/utils";
import type { PlaygroundChunk } from "@/store/types-ui";

/**
 * Renders the accumulated `PlaygroundChunk[]` from a rid-keyed playground
 * entry. One row per chunk: SSE events show the raw event payload, WS
 * messages show the bidirectional data, HTTP results are unreachable here
 * (the response panel renders those under the Body tab via
 * `entry.response`).
 */
export function PlaygroundStreamList({
  chunks,
}: {
  chunks: PlaygroundChunk[];
}): React.ReactElement {
  return (
    <div className="min-w-0 space-y-px overflow-hidden p-3">
      <div className="mb-2 flex items-center gap-3 px-2 text-caption text-muted-foreground">
        <span className="tabular-nums">{chunks.length} events</span>
      </div>
      {chunks.map((chunk, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: chunks are only ever appended, so a chunk's place is its sequence number
        <ChunkRow key={index} chunk={chunk} seq={index + 1} />
      ))}
    </div>
  );
}

function ChunkRow({ chunk, seq }: { chunk: PlaygroundChunk; seq: number }): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);

  const { preview, direction } = describeChunk(chunk);
  const hasPreview = preview !== undefined;

  return (
    <div
      className={cn(
        "group rounded-md px-2 py-1.5 transition-colors",
        hasPreview && "cursor-pointer hover:bg-muted/50",
      )}
      {...(hasPreview ? buttonProps(toggle) : {})}
    >
      <div className="flex min-w-0 items-center gap-2">
        {hasPreview ? (
          <ChevronRight
            className={cn(
              "size-3 shrink-0 text-muted-foreground/50 transition-transform duration-150",
              expanded && "rotate-90 text-muted-foreground",
            )}
          />
        ) : (
          <span className="size-3 shrink-0" />
        )}
        <span className="mono-xs w-7 shrink-0 text-right tabular-nums text-muted-foreground/60">
          {seq}
        </span>
        {direction === "inbound" ? (
          <ArrowDown className="size-3 shrink-0 text-emerald-400/70" />
        ) : direction === "outbound" ? (
          <ArrowUp className="size-3 shrink-0 text-sky-400/70" />
        ) : null}
        <span className="min-w-0 flex-1 truncate mono-xs text-foreground/70">
          {preview ?? chunk.kind}
        </span>
      </div>
      {expanded && preview && (
        <div className="mt-1 ml-10.5 overflow-x-auto rounded-md border border-border-subtle/50 bg-zinc-950/60 p-2.5">
          <pre className="mono-xs leading-relaxed text-foreground/80">{highlightJson(preview)}</pre>
        </div>
      )}
    </div>
  );
}

function describeChunk(chunk: PlaygroundChunk): {
  preview: string | undefined;
  direction: "inbound" | "outbound" | undefined;
} {
  if (chunk.kind === "sse-event") {
    return { preview: serialize(chunk.event), direction: "inbound" };
  }
  if (chunk.kind === "ws-message") {
    return { preview: serialize(chunk.data), direction: "inbound" };
  }
  // http-result never appears here — rendered under the Body tab
  return { preview: undefined, direction: undefined };
}

function serialize(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function highlightJson(raw: string): React.ReactNode[] {
  const formatted = tryFormatJson(raw);
  return formatted.split("\n").flatMap((line, i, arr) => {
    const nodes = highlightLine(line, "json");
    return i < arr.length - 1 ? [...nodes, "\n"] : nodes;
  });
}

function tryFormatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
