import { ChevronDown, ChevronRight, Copy, Eye, EyeOff, Search } from "lucide-react";
import { useState } from "react";

import type { HeaderGroup } from "@/features/requests/header-groups";
import { headerGroupsOf, headersAsText } from "@/features/requests/header-groups";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import type { RequestEntry } from "@/store/types";

const MASK = "••••••••••••••••";

/**
 * A request's headers by side, each side folding, a filter over names and
 * values, credentials hidden until the eye shows them — and, for a direct
 * call, why some headers are missing.
 *
 * @param props - The request
 * @returns The tab
 * @example
 * ```tsx
 * <HeadersTab request={request} />
 * ```
 */
export function HeadersTab({ request }: { request: RequestEntry }): React.ReactNode {
  const [filter, setFilter] = useState("");
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const [revealed, setRevealed] = useState(false);
  const toggle = (key: string) =>
    setClosed((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  return (
    <div className="flex flex-col gap-3 px-4.5 pt-4.5 pb-7">
      <label className="flex h-8 items-center gap-2 rounded-card border border-line bg-inset px-2.5">
        <Search aria-hidden="true" className="size-3 text-fg-subtle" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter headers by name or value…"
          aria-label="Filter headers"
          className="min-w-0 flex-1 bg-transparent text-control text-fg outline-none placeholder:text-fg-subtle"
        />
      </label>
      {request.mode === "direct" && (
        <p className="m-0 text-label leading-normal text-fg-subtle">
          A direct call lists the headers your code set; the ones the browser or the HTTP client
          adds as it sends are not seen by Courier.
        </p>
      )}
      {headerGroupsOf(request, filter).map((group) => (
        <Group
          key={group.key}
          group={group}
          open={!closed.has(group.key)}
          revealed={revealed}
          onToggle={() => toggle(group.key)}
          onReveal={() => setRevealed((r) => !r)}
          filtered={filter.trim() !== ""}
        />
      ))}
    </div>
  );
}

interface GroupProps {
  group: HeaderGroup;
  open: boolean;
  revealed: boolean;
  filtered: boolean;
  onToggle: () => void;
  onReveal: () => void;
}

function Group({
  group,
  open,
  revealed,
  filtered,
  onToggle,
  onReveal,
}: GroupProps): React.ReactNode {
  const Caret = open ? ChevronDown : ChevronRight;
  return (
    <section className="overflow-hidden rounded-panel border border-line">
      <div className="flex h-9.5 items-center gap-2 bg-panel-subtle pr-2 pl-3">
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
            className="flex h-6 cursor-pointer items-center gap-1.25 rounded-[6px] px-2 text-label text-fg-subtle transition-colors hover:bg-panel hover:text-fg"
          >
            <Copy aria-hidden="true" className="size-2.75" />
            Copy all
          </button>
        )}
      </div>
      {open && (
        <div className="border-t border-line font-mono text-label">
          {group.rows.map((row) => (
            <div
              key={row.name}
              className="grid min-h-8 grid-cols-[minmax(110px,38%)_minmax(0,1fr)_20px] items-center gap-3 border-b border-line px-3 py-1.5 last:border-b-0 hover:bg-raised"
            >
              <span className="text-syntax-function [overflow-wrap:anywhere]">{row.name}</span>
              <span
                className={cn(
                  "leading-normal [overflow-wrap:anywhere]",
                  row.secret && !revealed ? "text-fg-subtle" : "text-syntax-plain",
                )}
              >
                {row.secret && !revealed ? MASK : row.value}
              </span>
              {row.secret && (
                <button
                  type="button"
                  title={revealed ? "Hide credentials" : "Show credentials"}
                  aria-label={revealed ? "Hide credentials" : "Show credentials"}
                  onClick={onReveal}
                  className="flex cursor-pointer text-fg-subtle hover:text-fg"
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
              {filtered ? "No headers match" : "None captured"}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
