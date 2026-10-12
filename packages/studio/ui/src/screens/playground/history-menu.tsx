import { History, Trash2 } from "lucide-react";
import { Popover } from "radix-ui";
import { useState } from "react";

import { POP_MOTION } from "@/design/overlay-motion";
import { shortAgo } from "@/features/explorer/endpoint-key";
import { cn } from "@/lib/utils";
import { methodClassOf } from "@/screens/explorer/method-class";
import { useStudioStore } from "@/store";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";

function statusOf(entry: PlaygroundHistoryEntry): {
  tone: "ok" | "err" | "warn" | "brand";
  code: string;
} {
  if (entry.status === "pending") return { tone: entry.transport ? "brand" : "warn", code: "···" };
  const tone = entry.status === "error" ? "err" : "ok";
  if (entry.transport) return { tone, code: "—" };
  return {
    tone,
    code: entry.statusCode ? String(entry.statusCode) : entry.status === "error" ? "ERR" : "—",
  };
}

interface HistoryMenuProps {
  now: number;
  /** The method label a run's endpoint is listed under. */
  labelOf: (entry: PlaygroundHistoryEntry) => string;
  onPick: (entry: PlaygroundHistoryEntry) => void;
}

/**
 * The Playground's recent sends: each run's state, endpoint, status and
 * age; picking one brings back its endpoint, variables, headers and answer.
 *
 * @param props - The time now, each run's method label, and what picking a run does
 * @returns The menu
 * @example
 * ```tsx
 * <HistoryMenu now={now} labelOf={labelOf} onPick={restore} />
 * ```
 */
export function HistoryMenu({ now, labelOf, onPick }: HistoryMenuProps): React.ReactNode {
  const history = useStudioStore((s) => s.playgroundHistory);
  const clear = useStudioStore((s) => s.clearPlaygroundHistory);
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="flex h-8 shrink-0 cursor-pointer items-center gap-1.75 rounded-card border border-line bg-panel px-2.75 text-control text-fg-muted transition-colors hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-brand data-[state=open]:border-line-strong pointer-coarse:h-9">
        <History aria-hidden="true" className="size-3.25" />
        <span className="max-md:sr-only">History</span>
        <span className="flex h-4 min-w-4.5 items-center justify-center rounded-full bg-raised px-1.25 text-meta text-fg-subtle tabular-nums">
          {history.length}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            "z-50 w-[min(360px,calc(100vw-16px))] overflow-hidden rounded-dialog bg-panel shadow-overlay",
            POP_MOTION,
          )}
        >
          <div className="flex h-10 items-center gap-2 border-b border-line pr-1.5 pl-3">
            <span className="flex-1 text-control font-semibold">Recent sends</span>
            {history.length > 0 && (
              <button
                type="button"
                onClick={clear}
                className="flex h-6.5 cursor-pointer items-center gap-1.5 rounded-[6px] px-2 text-small text-fg-subtle hover:bg-raised hover:text-err pointer-coarse:h-9 pointer-coarse:px-2.5"
              >
                <Trash2 aria-hidden="true" className="size-3" />
                Clear
              </button>
            )}
          </div>
          <div className="max-h-[min(320px,50dvh)] overflow-auto p-1">
            {history.length === 0 && (
              <p className="px-3 py-5.5 text-center text-control text-fg-subtle">
                Nothing sent yet
              </p>
            )}
            {history.map((entry) => {
              const label = labelOf(entry);
              const status = statusOf(entry);
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    onPick(entry);
                    setOpen(false);
                  }}
                  className="grid h-8.5 w-full cursor-pointer grid-cols-[40px_minmax(0,1fr)_40px_56px] items-center gap-2.5 rounded-control px-2.5 text-left font-mono text-label hover:bg-raised pointer-coarse:h-10"
                >
                  <span className={cn("text-micro font-semibold", methodClassOf(label))}>
                    {label}
                  </span>
                  <span className="truncate">
                    {entry.group && <span className="text-fg-subtle">{entry.group}.</span>}
                    {entry.method}
                  </span>
                  <span className={status.tone === "err" ? "text-err" : "text-ok"}>
                    {status.code}
                  </span>
                  <span className="text-right text-fg-subtle">
                    {shortAgo(now - entry.timestamp)}
                  </span>
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
