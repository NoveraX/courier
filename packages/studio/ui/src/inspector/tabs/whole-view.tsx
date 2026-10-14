import { CodeLines } from "@/design/code/code-lines";
import { tokenizeJsonLine } from "@/design/code/tokenize-json-line";
import { foldedRows } from "@/features/requests/folded-rows";
import type { WholeSearchResult } from "@/features/requests/whole-search";
import { TreeRows } from "../tree-rows";

interface WholeViewProps {
  result: WholeSearchResult;
  mode: "tree" | "raw";
  query: string;
  /** The current match: a path in the tree, a line in the raw text. */
  currentPath: string | undefined;
  currentLine: number | undefined;
  /** The containers closed, and what opens or closes one. */
  collapsed: ReadonlySet<string>;
  onToggle: (path: string) => void;
}

/**
 * What a search over a whole body found, in place of the part shown: the
 * tree keeps each match and what holds it, with the text marked; the raw
 * text shows the lines that hold it, numbered as in the whole body.
 *
 * @param props - What the search found, the view, the current match, and the containers closed
 * @returns The view
 * @example
 * ```tsx
 * <WholeView result={search.wholeShown} mode="tree" query="kaz" currentPath={path} currentLine={undefined} collapsed={closed} onToggle={toggle} />
 * ```
 */
export function WholeView({
  result,
  mode,
  query,
  currentPath,
  currentLine,
  collapsed,
  onToggle,
}: WholeViewProps): React.ReactNode {
  if (mode === "tree") {
    return (
      <TreeRows
        rows={foldedRows(result.rows, result.matches, collapsed)}
        query={query}
        current={currentPath}
        onToggle={onToggle}
        none={result.count === 0}
      />
    );
  }
  if (result.lines.length === 0) {
    return (
      <p className="m-0 rounded-panel border border-line bg-inset px-3 py-2 text-small text-fg-subtle">
        Nothing here matches.
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-panel border border-line bg-inset">
      <CodeLines
        variant="panel"
        code={result.lines.map((line) => line.text).join("\n")}
        numbers={result.lines.map((line) => line.number)}
        tokenize={tokenizeJsonLine}
        highlight="brand"
        isHighlighted={() => true}
        current={currentLine}
      />
    </div>
  );
}
