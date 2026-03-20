import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import { FilterSelect } from "./filter-select";
import type { FilterOption } from "./filter-select";

export interface FilterConfig {
  key: string;
  label: string;
  options: FilterOption[];
  searchable?: boolean;
}

interface FilterBarProps {
  filters: FilterConfig[];
  values: Record<string, string[]>;
  onChange: (key: string, selected: string[]) => void;
  onReset: () => void;
  className?: string;
}

export function FilterBar({
  filters,
  values,
  onChange,
  onReset,
  className,
}: FilterBarProps): React.ReactElement {
  const activeFilters = buildActiveFilters(filters, values);
  const hasActive = activeFilters.length > 0;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {filters.map((filter) => (
        <FilterSelect
          key={filter.key}
          label={filter.label}
          options={filter.options}
          selected={values[filter.key] ?? []}
          onChange={(selected) => onChange(filter.key, selected)}
          searchable={filter.searchable}
        />
      ))}

      {hasActive && (
        <>
          <Separator orientation="vertical" className="h-5" />

          {activeFilters.map((af) => (
            <Badge
              key={`${af.filterKey}-${af.value}`}
              variant="secondary"
              className="gap-1 pr-1"
            >
              <span className="text-[10px] text-muted-foreground">{af.filterLabel}:</span>
              <span className="text-[10px]">{af.optionLabel}</span>
              <button
                type="button"
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                onClick={() => removeFilter(af.filterKey, af.value, values, onChange)}
                aria-label={`Remove ${af.optionLabel} filter`}
              >
                <X className="size-2.5" />
              </button>
            </Badge>
          ))}

          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={onReset}
          >
            Reset
          </Button>
        </>
      )}
    </div>
  );
}

interface ActiveFilter {
  filterKey: string;
  filterLabel: string;
  value: string;
  optionLabel: string;
}

function buildActiveFilters(
  filters: FilterConfig[],
  values: Record<string, string[]>,
): ActiveFilter[] {
  const result: ActiveFilter[] = [];

  for (const filter of filters) {
    const selected = values[filter.key] ?? [];
    for (const value of selected) {
      const option = filter.options.find((o) => o.value === value);
      result.push({
        filterKey: filter.key,
        filterLabel: filter.label,
        value,
        optionLabel: option?.label ?? value,
      });
    }
  }

  return result;
}

function removeFilter(
  key: string,
  value: string,
  values: Record<string, string[]>,
  onChange: (key: string, selected: string[]) => void,
): void {
  const current = values[key] ?? [];
  onChange(key, current.filter((v) => v !== value));
}

export { FilterSelect } from "./filter-select";
export type { FilterOption } from "./filter-select";
