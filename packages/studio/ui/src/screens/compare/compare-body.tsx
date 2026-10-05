import { FoldVertical, UnfoldVertical } from "lucide-react";
import { useState } from "react";

import type { SegmentedOption } from "@/design/segmented";
import { Segmented } from "@/design/segmented";
import type { RequestPair } from "@/features/compare/compare-pairs";
import type { CompareTab } from "@/features/compare/compare-search";
import { changeCount, diffRows } from "@/features/compare/diff-rows";
import { headerDiff } from "@/features/compare/header-diff";
import { lineDiff } from "@/features/compare/line-diff";
import { responseText, variablesText } from "@/features/compare/payload-text";
import { timingRows } from "@/features/compare/timing-rows";
import { formatAbsoluteTime } from "@/lib/formatters";
import { useStudioStore } from "@/store";
import { DiffView } from "./diff-view";
import { HeadersTable } from "./headers-table";
import { TimingTable } from "./timing-table";

function counted(value: CompareTab, label: string, count: number): SegmentedOption<CompareTab> {
  return { value, label, count, countTone: count > 0 ? "warn" : "subtle" };
}

interface CompareBodyProps {
  pair: RequestPair;
  tab: CompareTab;
  onTab: (tab: CompareTab) => void;
}

/**
 * The two calls diffed: their responses and variables line against line
 * — every line, or only the changes — their headers, and their timing,
 * each tab saying how much changed.
 *
 * @param props - The pair, the tab shown, and what switches it
 * @returns The diffs
 * @example
 * ```tsx
 * <CompareBody pair={[a, b]} tab="response" onTab={setTab} />
 * ```
 */
export function CompareBody({ pair, tab, onTab }: CompareBodyProps): React.ReactNode {
  const [a, b] = pair;
  const indent = useStudioStore((s) => s.settings.jsonIndent);
  const [onlyChanges, setOnlyChanges] = useState(false);
  const lines = (text: (r: typeof a, indent: number) => string) =>
    lineDiff(text(a, indent).split("\n"), text(b, indent).split("\n"));
  const response = lines(responseText);
  const variables = lines(variablesText);
  const headers = headerDiff(a.headers, b.headers);
  const tabs = [
    counted("response", "Response", changeCount(response)),
    counted("headers", "Headers", headers.filter((h) => h.change !== "same").length),
    { value: "timing" as const, label: "Timing" },
    counted("variables", "Variables", changeCount(variables)),
  ];
  const textual = tab === "response" || tab === "variables";
  const Fold = onlyChanges ? UnfoldVertical : FoldVertical;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <Segmented label="Show" options={tabs} value={tab} onChange={onTab} />
        <div className="flex-1" />
        {textual && (
          <button
            type="button"
            aria-pressed={onlyChanges}
            onClick={() => setOnlyChanges((on) => !on)}
            className="flex h-7 cursor-pointer items-center gap-1.75 rounded-control border border-line px-2.5 text-small text-fg-muted hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-brand"
          >
            <Fold aria-hidden="true" className="size-3" />
            {onlyChanges ? "Show all lines" : "Only changes"}
          </button>
        )}
      </div>
      {tab === "response" && (
        <DiffView
          rows={diffRows(response, onlyChanges)}
          titles={{
            a: `A · ${formatAbsoluteTime(a.startedAt)}`,
            b: `B · ${formatAbsoluteTime(b.startedAt)}`,
          }}
        />
      )}
      {tab === "variables" && (
        <DiffView
          rows={diffRows(variables, onlyChanges)}
          titles={{ a: "Variables", b: "Variables" }}
        />
      )}
      {tab === "headers" && <HeadersTable rows={headers} />}
      {tab === "timing" && <TimingTable rows={timingRows(a, b)} />}
    </>
  );
}
