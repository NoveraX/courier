import { ChevronDown, ChevronRight, Link2, TriangleAlert } from "lucide-react";

import { HighlightMatch } from "@/design/highlight-match";
import type { JsonTreeRow } from "@/features/requests/json-tree";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

const VALUE_TONE: Readonly<Record<JsonTreeRow["tone"], string>> = {
  string: "text-syntax-string",
  number: "text-syntax-number",
  literal: "text-syntax-keyword",
  punctuation: "text-fg-subtle",
};

interface TreeRowProps {
  row: JsonTreeRow;
  /** The text a search seeks, marked where it is found; blank marks nothing. */
  query: string;
  /** Whether the search's current match is this row's. */
  current: boolean;
  onToggle: (path: string) => void;
}

/**
 * One line of a JSON tree: a value, or an object or array that a click
 * opens or closes, marked with a validation issue at it, the text a search
 * found in it, and a way to copy how code reaches the value.
 *
 * @param props - The row, the search, whether its match is the current one, and what toggles it
 * @returns The row
 * @example
 * ```tsx
 * <TreeRow row={row} query="kazan" current={false} onToggle={toggle} />
 * ```
 */
export function TreeRow({ row, query, current, onToggle }: TreeRowProps): React.ReactNode {
  const toggles = row.kind === "open";
  const Caret = row.collapsed ? ChevronRight : ChevronDown;
  const key = row.key && (row.key.index ? row.key.text : JSON.stringify(row.key.text));
  const content = (
    <>
      <span className="flex w-3.5 shrink-0 text-fg-subtle">
        {toggles && <Caret aria-hidden="true" className="size-2.75" />}
      </span>
      {key && (
        <>
          <span className={row.key?.index ? "text-fg-subtle" : "text-syntax-function"}>
            <HighlightMatch text={key} query={query} />
          </span>
          <span className="mr-1.5 text-fg-subtle">:</span>
        </>
      )}
      <span className={cn("truncate", VALUE_TONE[row.tone])}>
        <HighlightMatch text={row.text} query={row.kind === "value" ? query : ""} />
      </span>
      {toggles && <span className="ml-2 text-badge text-fg-subtle">{row.summary}</span>}
      {row.issue && (
        <span className="ml-2.5 flex h-4.5 items-center gap-1 rounded-chip bg-warn-dim px-1.5 font-sans text-badge font-strong text-warn">
          <TriangleAlert aria-hidden="true" className="size-2.5" />
          {row.issue}
        </span>
      )}
    </>
  );
  const line =
    "flex min-h-6.25 min-w-0 flex-1 items-center gap-0.5 font-mono text-small whitespace-nowrap pointer-coarse:min-h-8";
  return (
    <div
      data-path={row.kind === "close" ? undefined : row.path}
      aria-current={current ? "true" : undefined}
      className={cn(
        "group flex items-center pr-2 hover:bg-raised",
        row.issue && "bg-warn-dim",
        current && "bg-brand-tint",
      )}
      style={{ paddingLeft: `${12 + row.depth * 16}px` }}
    >
      {toggles ? (
        <button
          type="button"
          aria-expanded={!row.collapsed}
          onClick={() => onToggle(row.path)}
          className={cn(line, "cursor-pointer text-left")}
        >
          {content}
        </button>
      ) : (
        <div className={line}>{content}</div>
      )}
      {row.kind !== "close" && row.accessor !== "" && (
        <button
          type="button"
          title={`Copy the path: ${row.accessor}`}
          aria-label={`Copy the path ${row.accessor}`}
          onClick={() => void copyToClipboard(row.accessor, "the path")}
          className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-[5px] text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:text-fg focus-visible:opacity-100 pointer-coarse:size-8 pointer-coarse:opacity-100"
        >
          <Link2 aria-hidden="true" className="size-3" />
        </button>
      )}
    </div>
  );
}
