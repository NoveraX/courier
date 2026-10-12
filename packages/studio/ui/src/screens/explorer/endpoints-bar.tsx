import { ListFilter } from "lucide-react";

import { ChoiceMenu } from "@/design/choice-menu";
import { SearchField } from "@/design/search-field";
import type { SegmentedOption } from "@/design/segmented";
import { Segmented } from "@/design/segmented";
import type { EndpointKind } from "@/features/explorer/explorer-search";

interface EndpointsBarProps {
  q: string;
  onSearch: (q: string) => void;
  /** Each kind the list narrows to, with how many endpoints it holds. */
  kinds: readonly SegmentedOption<EndpointKind>[];
  kind: EndpointKind;
  onKind: (kind: EndpointKind) => void;
  /** What the list shows, said over it rather than here when `compact`. */
  summary: React.ReactNode;
  /** One row for a narrow list: the search, and the kind picked from a menu. */
  compact: boolean;
}

/**
 * The Endpoints list's bar: its search, the kinds it narrows to with their
 * counts, and how many endpoints it shows. Over a narrow list it keeps to
 * one row — the search takes the width, the kind is picked from a menu,
 * and the count moves over the list.
 *
 * @param props - The search, the kinds and the one chosen, the count, and whether it is compact
 * @returns The bar
 * @example
 * ```tsx
 * <EndpointsBar q={q} onSearch={search} kinds={kinds} kind="all" onKind={narrow} summary={summary} compact={false} />
 * ```
 */
export function EndpointsBar(props: EndpointsBarProps): React.ReactNode {
  const { q, onSearch, kinds, kind, onKind, summary, compact } = props;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2.5 border-b border-line bg-bg-subtle py-2.5 pr-4 pl-5 pointer-coarse:py-1.5">
      <SearchField
        value={q}
        onChange={onSearch}
        placeholder="Search endpoints…"
        label="Search endpoints"
        className={compact ? "min-w-0 flex-1" : "w-70 max-w-full"}
      />
      {compact ? (
        <ChoiceMenu
          icon={ListFilter}
          label="Kind"
          choices={kinds.map((option) => ({
            value: option.value,
            label: `${option.label} · ${option.count ?? 0}`,
          }))}
          value={kind}
          onChange={onKind}
        />
      ) : (
        <>
          <Segmented label="Kind" options={kinds} value={kind} onChange={onKind} quiet="subtle" />
          <div className="flex-1" />
          <span className="text-control text-fg-subtle">{summary}</span>
        </>
      )}
    </div>
  );
}
