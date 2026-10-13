import type { JsonSearch } from "@/features/requests/json-search";
import { jsonTreeRows } from "@/features/requests/json-tree";
import { TreeRow } from "./json-tree-row";

interface JsonTreeViewProps {
  value: unknown;
  collapsed: ReadonlySet<string>;
  issues: ReadonlyMap<string, string>;
  onToggle: (path: string) => void;
  /** A search over the value: what it seeks, what it found, and the match shown as current. */
  search?: { query: string; found: JsonSearch; current: string | undefined } | undefined;
}

/**
 * A JSON value as a tree: a click on an object or array opens or closes
 * it, a value a validation issue points at is marked with it, and each row
 * copies how code reaches it. While a search runs, the tree shows what it
 * found and what holds it, opened, with the text it found marked.
 *
 * @param props - The value, the paths closed, the issues, what toggles a path, and the search
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
  search,
}: JsonTreeViewProps): React.ReactNode {
  const closed = search
    ? new Set([...collapsed].filter((path) => !search.found.opened.has(path)))
    : collapsed;
  const rows = jsonTreeRows(value, closed, issues).filter(
    (row) => !search || search.found.keeps(row.path),
  );
  return (
    <div className="overflow-auto rounded-panel border border-line bg-inset py-1.5">
      {rows.map((row) => (
        <TreeRow
          key={`${row.kind}:${row.path}`}
          row={row}
          query={search?.query ?? ""}
          current={row.kind !== "close" && search?.current === row.path}
          onToggle={onToggle}
        />
      ))}
      {search && search.found.matches.length === 0 && (
        <p className="m-0 px-3 py-2 text-small text-fg-subtle">Nothing here matches.</p>
      )}
    </div>
  );
}
