import type { JsonTreeRow } from "@/features/requests/json-tree";
import { TreeRow } from "./json-tree-row";

interface TreeRowsProps {
  rows: readonly JsonTreeRow[];
  /** The text a search seeks, marked where it is found; blank marks nothing. */
  query: string;
  /** The path of the search's current match. */
  current: string | undefined;
  onToggle: (path: string) => void;
  /** Whether a search found nothing here: the tree says so. */
  none?: boolean | undefined;
}

/**
 * The rows of a JSON tree in their frame, and what it says when a search
 * found nothing in it.
 *
 * @param props - The rows, the search, and what toggles a container
 * @returns The tree
 * @example
 * ```tsx
 * <TreeRows rows={rows} query="kazan" current="cities.3.name" onToggle={toggle} />
 * ```
 */
export function TreeRows({ rows, query, current, onToggle, none }: TreeRowsProps): React.ReactNode {
  return (
    <div className="overflow-auto rounded-panel border border-line bg-inset py-1.5">
      {rows.map((row) => (
        <TreeRow
          key={`${row.kind}:${row.path}`}
          row={row}
          query={query}
          current={row.kind !== "close" && current === row.path}
          onToggle={onToggle}
        />
      ))}
      {none && <p className="m-0 px-3 py-2 text-small text-fg-subtle">Nothing here matches.</p>}
    </div>
  );
}
