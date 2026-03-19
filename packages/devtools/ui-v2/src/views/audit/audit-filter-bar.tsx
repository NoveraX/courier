import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { cn } from "../../lib/utils";
import { CATEGORY_CONFIG, SEVERITY_CONFIG } from "./constants";
import type { AuditCategory, AuditResult, AuditSeverity } from "./types";
import type { SeverityFilter } from "./use-audit";

interface AuditFilterBarProps {
  result: AuditResult;
  severityFilter: SeverityFilter;
  categoryFilter: AuditCategory | "all";
  onSeverityChange: (f: SeverityFilter) => void;
  onCategoryChange: (f: AuditCategory | "all") => void;
  totalFiltered: number;
  children?: React.ReactNode;
}

const SEVERITIES: SeverityFilter[] = ["all", "error", "warning", "hint", "pass"];
const CATEGORIES: (AuditCategory | "all")[] = [
  "all",
  "performance",
  "reliability",
  "security",
  "best-practices",
];

export function AuditFilterBar({
  result,
  severityFilter,
  categoryFilter,
  onSeverityChange,
  onCategoryChange,
  totalFiltered,
  children,
}: AuditFilterBarProps): React.ReactNode {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-1">
        <SeverityButtons
          breakdown={result.breakdown}
          active={severityFilter}
          onChange={onSeverityChange}
        />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-caption text-muted-foreground">
          {totalFiltered} items
        </span>
        <CategorySelect active={categoryFilter} onChange={onCategoryChange} />
        {children}
      </div>
    </div>
  );
}

function SeverityButtons({
  breakdown,
  active,
  onChange,
}: {
  breakdown: Record<AuditSeverity, number>;
  active: SeverityFilter;
  onChange: (f: SeverityFilter) => void;
}): React.ReactNode {
  return (
    <div className="inline-flex h-7 items-center gap-px rounded-lg border border-border-subtle bg-muted/60 p-0.5">
      {SEVERITIES.map((sev) => {
        const isActive = active === sev;
        const cfg = sev === "all" ? null : SEVERITY_CONFIG[sev];
        const count = sev === "all" ? null : breakdown[sev];
        const Icon = cfg?.icon;

        return (
          <button
            key={sev}
            type="button"
            onClick={() => onChange(sev)}
            className={cn(
              "flex h-full items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-all",
              isActive
                ? "bg-background text-foreground shadow-sm ring-1 ring-border-subtle"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50",
            )}
          >
            {Icon && <Icon className={cn("size-3", isActive && cfg.color)} />}
            <span>{sev === "all" ? "All" : cfg!.label}</span>
            {count != null && count > 0 && (
              <span className="tabular-nums opacity-60">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function CategorySelect({
  active,
  onChange,
}: {
  active: AuditCategory | "all";
  onChange: (f: AuditCategory | "all") => void;
}): React.ReactNode {
  return (
    <Select value={active} onValueChange={(v) => onChange(v as AuditCategory | "all")}>
      <SelectTrigger size="sm" className="h-7! w-auto gap-1.5 border-border-subtle bg-muted/60 px-2.5 py-0 text-[11px] [&>svg]:size-3">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CATEGORIES.map((cat) => (
          <SelectItem key={cat} value={cat} className="text-xs">
            {cat === "all" ? "All categories" : CATEGORY_CONFIG[cat].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
