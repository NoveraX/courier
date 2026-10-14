import type { JsonSearch } from "@/features/requests/json-search";
import { jsonTreeRows } from "@/features/requests/json-tree";
import { TreeRows } from "./tree-rows";

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
  const kept = search && { keeps: search.found.keeps, limit: Number.POSITIVE_INFINITY };
  return (
    <TreeRows
      rows={jsonTreeRows(value, closed, issues, kept)}
      query={search?.query ?? ""}
      current={search?.current}
      onToggle={onToggle}
      none={search !== undefined && search.found.matches.length === 0}
    />
  );
}
