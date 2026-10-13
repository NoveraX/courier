import { ChevronDown, ChevronRight, Copy, Eye, EyeOff } from "lucide-react";
import { HighlightMatch } from "@/design/highlight-match";
import type { HeaderGroup } from "@/features/requests/header-groups";
import { headersAsText } from "@/features/requests/header-groups";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

const MASK = "••••••••••••••••";

interface HeaderGroupSectionProps {
  group: HeaderGroup;
  open: boolean;
  revealed: boolean;
  /** The filter over names and values, marked where it is found; blank when none is on. */
  query: string;
  onToggle: () => void;
  onReveal: () => void;
}

/**
 * One side of a request's headers: its title and count, folding, a way to
 * copy them all, what the reader should know about the side, and each
 * header with credentials masked until revealed. Where the section is
 * narrow, as on a phone, each value sits under its name, at full width.
 *
 * @param props - The side, whether it is open, whether credentials show, the filter marked in it, and what folds it and reveals credentials
 * @returns The section
 * @example
 * ```tsx
 * <HeaderGroupSection group={group} open revealed={false} query="" onToggle={fold} onReveal={reveal} />
 * ```
 */
export function HeaderGroupSection({
  group,
  open,
  revealed,
  query,
  onToggle,
  onReveal,
}: HeaderGroupSectionProps): React.ReactNode {
  const Caret = open ? ChevronDown : ChevronRight;
  return (
    <section
      aria-label={group.title}
      className="@container overflow-hidden rounded-panel border border-line"
    >
      <div className="flex h-9.5 items-center gap-2 bg-panel-subtle pr-2 pl-3 pointer-coarse:h-11">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 self-stretch text-left"
        >
          <Caret aria-hidden="true" className="size-3.25 text-fg-subtle" />
          <span className="text-control font-semibold">{group.title}</span>
          <span className="inline-flex h-4 min-w-4.5 items-center justify-center rounded-full bg-raised px-1.25 text-meta text-fg-subtle tabular-nums">
            {group.total}
          </span>
        </button>
        {group.total > 0 && (
          <button
            type="button"
            onClick={() =>
              void copyToClipboard(headersAsText(group.rows), group.title.toLowerCase())
            }
            className="flex h-6 cursor-pointer items-center gap-1.25 rounded-[6px] px-2 text-label text-fg-subtle transition-colors hover:bg-panel hover:text-fg pointer-coarse:h-9"
          >
            <Copy aria-hidden="true" className="size-2.75" />
            Copy all
          </button>
        )}
      </div>
      {open && (
        <div className="border-t border-line font-mono text-label">
          {group.note && (
            <p className="m-0 border-b border-line bg-warn-dim px-3 py-2 font-sans text-label leading-normal text-warn">
              {group.note}
            </p>
          )}
          {group.rows.map((row) => (
            <div
              key={row.name}
              className="grid min-h-8 grid-cols-[minmax(110px,38%)_minmax(0,1fr)_20px] items-center gap-3 border-b border-line px-3 py-1.5 last:border-b-0 hover:bg-raised @max-[420px]:grid-cols-[minmax(0,1fr)_20px] @max-[420px]:gap-y-0.5 @max-[420px]:py-2"
            >
              <span className="text-syntax-function [overflow-wrap:anywhere]">
                <HighlightMatch text={row.name} query={query} />
              </span>
              <span
                className={cn(
                  "leading-normal [overflow-wrap:anywhere] @max-[420px]:col-start-1 @max-[420px]:row-start-2",
                  row.secret && !revealed ? "text-fg-subtle" : "text-syntax-plain",
                )}
              >
                {row.secret && !revealed ? MASK : <HighlightMatch text={row.value} query={query} />}
              </span>
              {row.secret && (
                <button
                  type="button"
                  title={revealed ? "Hide credentials" : "Show credentials"}
                  aria-label={revealed ? "Hide credentials" : "Show credentials"}
                  onClick={onReveal}
                  className="relative flex cursor-pointer text-fg-subtle hit-area hover:text-fg @max-[420px]:col-start-2 @max-[420px]:row-span-2 @max-[420px]:row-start-1"
                >
                  {revealed ? (
                    <EyeOff aria-hidden="true" className="size-3.25" />
                  ) : (
                    <Eye aria-hidden="true" className="size-3.25" />
                  )}
                </button>
              )}
            </div>
          ))}
          {group.rows.length === 0 && (
            <p className="m-0 px-3 py-3.5 font-sans text-small text-fg-subtle">
              {query.trim() !== "" ? "No headers match" : "None captured"}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
