import { X } from "lucide-react";

import { SearchField } from "@/design/search-field";
import type { SegmentedOption } from "@/design/segmented";
import { Segmented } from "@/design/segmented";
import type { AuditSearch } from "@/features/audit/audit-search";
import { AUDIT_SEVERITIES } from "@/features/audit/audit-search";
import type { SeverityCounts } from "@/features/audit/finding-filter";
import type { AuditSeverity } from "@/features/audit/types";
import { CATEGORY_LOOK, SEVERITY_LOOK } from "./audit-look";

interface FindingsBarProps {
  search: AuditSearch;
  counts: SeverityCounts;
  onSearch: (next: AuditSearch) => void;
}

/* Each severity's count in its colour, where that colour means something to act on. */
const COUNT_TONE = { error: "err", warning: "warn", hint: "subtle", pass: "subtle" } as const;

/**
 * The findings' filters: a severity with how many each has, the category
 * chosen above as a chip that clears it, and a search of the titles and
 * summaries.
 *
 * @param props - The filters, the counts, and what changes the filters
 * @returns The bar
 * @example
 * ```tsx
 * <FindingsBar search={search} counts={severityCounts(items)} onSearch={update} />
 * ```
 */
export function FindingsBar({ search, counts, onSearch }: FindingsBarProps): React.ReactNode {
  const options: SegmentedOption<AuditSeverity | "all">[] = [
    { value: "all", label: "All", count: counts.all, countTone: "subtle" },
    ...AUDIT_SEVERITIES.map((severity) => ({
      value: severity,
      label: SEVERITY_LOOK[severity].label,
      count: counts[severity],
      countTone: COUNT_TONE[severity],
    })),
  ];
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Segmented
        label="Severity"
        options={options}
        value={search.sev ?? "all"}
        onChange={(sev) => onSearch({ ...search, sev: sev === "all" ? undefined : sev })}
      />
      {search.cat && (
        <button
          type="button"
          aria-label={`${CATEGORY_LOOK[search.cat].label} only — show every category`}
          onClick={() => onSearch({ ...search, cat: undefined })}
          className="flex h-7.5 cursor-pointer items-center gap-1.5 rounded-control border border-brand/40 bg-brand-dim px-2.5 text-small font-strong text-brand focus-visible:outline-2 focus-visible:outline-brand"
        >
          {CATEGORY_LOOK[search.cat].label}
          <X aria-hidden="true" className="size-3" />
        </button>
      )}
      <div className="flex-1" />
      <SearchField
        value={search.q ?? ""}
        onChange={(q) => onSearch({ ...search, q: q || undefined })}
        placeholder="Search findings…"
        label="Search findings"
        className="w-60 max-w-full"
      />
    </div>
  );
}
