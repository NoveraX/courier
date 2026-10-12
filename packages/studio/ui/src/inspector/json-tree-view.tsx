import { ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";

import type { JsonTreeRow } from "@/features/requests/json-tree";
import { jsonTreeRows } from "@/features/requests/json-tree";
import { cn } from "@/lib/utils";

const VALUE_TONE: Readonly<Record<JsonTreeRow["tone"], string>> = {
  string: "text-syntax-string",
  number: "text-syntax-number",
  literal: "text-syntax-keyword",
  punctuation: "text-fg-subtle",
};

interface JsonTreeViewProps {
  value: unknown;
  collapsed: ReadonlySet<string>;
  issues: ReadonlyMap<string, string>;
  onToggle: (path: string) => void;
}

/**
 * A JSON value as a tree: a click on an object or array opens or closes
 * it, and a value a validation issue points at is marked with it.
 *
 * @param props - The value, the paths closed, the issues, and what toggles a path
 * @returns The tree
 * @example
 * ```tsx
 * <JsonTreeView value={data} collapsed={closed} issues={issues} onToggle={toggle} />
 * ```
 */
export function JsonTreeView({
  value,
  collapsed,
  issues,
  onToggle,
}: JsonTreeViewProps): React.ReactNode {
  return (
    <div className="overflow-auto rounded-panel border border-line bg-inset py-1.5">
      {jsonTreeRows(value, collapsed, issues).map((row) => (
        <TreeRow key={`${row.kind}:${row.path}`} row={row} onToggle={onToggle} />
      ))}
    </div>
  );
}

function TreeRow({
  row,
  onToggle,
}: {
  row: JsonTreeRow;
  onToggle: (path: string) => void;
}): React.ReactNode {
  const toggles = row.kind === "open";
  const Caret = row.collapsed ? ChevronRight : ChevronDown;
  const content = (
    <>
      <span className="flex w-3.5 shrink-0 text-fg-subtle">
        {toggles && <Caret aria-hidden="true" className="size-2.75" />}
      </span>
      {row.key && (
        <>
          <span className={row.key.index ? "text-fg-subtle" : "text-syntax-function"}>
            {row.key.index ? row.key.text : JSON.stringify(row.key.text)}
          </span>
          <span className="mr-1.5 text-fg-subtle">:</span>
        </>
      )}
      <span className={cn("truncate", VALUE_TONE[row.tone])}>{row.text}</span>
      {toggles && <span className="ml-2 text-badge text-fg-subtle">{row.summary}</span>}
      {row.issue && (
        <span className="ml-2.5 flex h-4.5 items-center gap-1 rounded-chip bg-warn-dim px-1.5 font-sans text-badge font-strong text-warn">
          <TriangleAlert aria-hidden="true" className="size-2.5" />
          {row.issue}
        </span>
      )}
    </>
  );
  const className = cn(
    "flex min-h-6.25 w-full items-center gap-0.5 pr-3 font-mono text-small whitespace-nowrap hover:bg-raised pointer-coarse:min-h-8",
    row.issue && "bg-warn-dim",
  );
  const style = { paddingLeft: `${12 + row.depth * 16}px` };
  if (!toggles) {
    return (
      <div className={className} style={style}>
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-expanded={!row.collapsed}
      onClick={() => onToggle(row.path)}
      className={cn(className, "cursor-pointer text-left")}
      style={style}
    >
      {content}
    </button>
  );
}
