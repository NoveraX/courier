import { Braces, Inbox, ListTree } from "lucide-react";
import { useState } from "react";

import { CodeLines } from "@/design/code/code-lines";
import { tokenizeJsonLine } from "@/design/code/tokenize-json-line";
import type { SegmentedOption } from "@/design/segmented";
import { containerPaths, jsonLines } from "@/features/requests/json-tree";
import type { PayloadView } from "@/features/requests/payload-view";
import { copyToClipboard } from "@/lib/clipboard";
import { JsonTreeView } from "../json-tree-view";
import { CodeEmpty, CodeToolbar } from "./code-toolbar";
import { CutNote } from "./cut-note";
import { DetailSearch } from "./detail-search";
import { usePayloadSearch } from "./use-payload-search";

/** How a payload shows: as a tree, or as the JSON text. */
export type PayloadMode = "tree" | "raw";

const MODES: readonly SegmentedOption<PayloadMode>[] = [
  { value: "tree", label: "Tree", icon: ListTree },
  { value: "raw", label: "Raw", icon: Braces },
];

interface PayloadTabProps {
  view: PayloadView;
  mode: PayloadMode;
  onMode: (mode: PayloadMode) => void;
  /** What its search field asks for: `Find in the answer`. */
  searchLabel?: string | undefined;
  /** Downloads the whole payload, when the view shows a part of it and the whole can be had. */
  onWhole?: (() => void) | undefined;
}

/**
 * A request's answer or its variables: as a tree whose branches open and
 * close, or as the JSON text, marked where a validation issue points; or
 * what the tab says when there is none. A search finds a text in its keys
 * and values: the tree keeps what matches and what holds it, the raw text
 * marks its lines, and Enter moves from one match to the next.
 *
 * @param props - The payload's view, how it shows, and what changes that
 * @returns The tab
 * @example
 * ```tsx
 * <PayloadTab view={responseView(request)} mode={mode} onMode={setMode} />
 * ```
 */
export function PayloadTab({
  view,
  mode,
  onMode,
  onWhole,
  searchLabel = "Find",
}: PayloadTabProps): React.ReactNode {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const hasValue = view.value !== undefined;
  const text = hasValue ? JSON.stringify(view.value, null, 2) : view.text;
  const toggle = (path: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  const folding =
    hasValue && mode === "tree"
      ? collapsed.size > 0
        ? { label: "Expand all", onClick: () => setCollapsed(new Set()) }
        : {
            label: "Collapse all",
            onClick: () =>
              setCollapsed(new Set(containerPaths(view.value).filter((p) => p !== ""))),
          }
      : undefined;
  const lines = hasValue ? jsonLines(view.value, view.issues) : [];
  const search = usePayloadSearch(view.value, lines, mode);
  const searching = search.counted !== undefined;
  return (
    <div ref={search.container} className="flex flex-col gap-3 px-4.5 pt-4.5 pb-7">
      <CodeToolbar
        label="View"
        modes={MODES}
        mode={mode}
        onMode={onMode}
        chips={view.chips}
        folding={folding}
        onCopy={
          text === undefined ? undefined : () => void copyToClipboard(text, "to the clipboard")
        }
      />
      {hasValue && (
        <DetailSearch
          label={searchLabel}
          query={search.query}
          onQuery={search.setQuery}
          found={search.counted}
          onStep={search.step}
        />
      )}
      {view.cutFrom !== undefined && <CutNote bytes={view.cutFrom} onWhole={onWhole} />}
      {view.empty && <CodeEmpty icon={Inbox} title={view.empty.title} detail={view.empty.detail} />}
      {hasValue && mode === "tree" && (
        <JsonTreeView
          value={view.value}
          collapsed={collapsed}
          issues={view.issues}
          onToggle={toggle}
          search={
            search.found && {
              query: search.query,
              found: search.found,
              current: search.currentPath,
            }
          }
        />
      )}
      {hasValue && mode === "raw" && (
        <div className="overflow-hidden rounded-panel border border-line bg-inset">
          <CodeLines
            variant="panel"
            code={lines.map((line) => line.text).join("\n")}
            tokenize={tokenizeJsonLine}
            highlight={searching ? "brand" : "warn"}
            isHighlighted={(_, n) =>
              searching ? search.lines.has(n) : lines[n - 1]?.issue !== undefined
            }
            current={search.currentLine}
          />
        </div>
      )}
      {!hasValue && view.text !== undefined && (
        <pre className="m-0 overflow-auto rounded-panel border border-line bg-inset px-3.5 py-2.5 font-mono text-small leading-[1.7] whitespace-pre-wrap text-fg">
          {view.text}
        </pre>
      )}
    </div>
  );
}
