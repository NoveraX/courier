import { cn } from "../../lib/utils";
import { CATEGORY_CONFIG, CATEGORY_ORDER, SEVERITY_CONFIG } from "./constants";
import type { AuditCategory, AuditItem, AuditSeverity } from "./types";

interface CategorySummaryProps {
  items: AuditItem[];
  onCategoryClick: (cat: AuditCategory) => void;
}

function worstSeverity(items: AuditItem[]): AuditSeverity | null {
  const order: AuditSeverity[] = ["error", "warning", "hint", "pass"];
  for (const sev of order) {
    if (items.some((i) => i.severity === sev)) return sev;
  }
  return null;
}

export function CategorySummary({ items, onCategoryClick }: CategorySummaryProps): React.ReactNode {
  return (
    <div className="grid grid-cols-4 gap-3">
      {CATEGORY_ORDER.map((cat) => {
        const catItems = items.filter((i) => i.category === cat);
        return (
          <CategoryCard
            key={cat}
            category={cat}
            items={catItems}
            onClick={() => onCategoryClick(cat)}
          />
        );
      })}
    </div>
  );
}

function CategoryCard({
  category,
  items,
  onClick,
}: {
  category: AuditCategory;
  items: AuditItem[];
  onClick: () => void;
}): React.ReactNode {
  const cfg = CATEGORY_CONFIG[category];
  const Icon = cfg.icon;
  const worst = worstSeverity(items);
  const worstCfg = worst ? SEVERITY_CONFIG[worst] : null;

  const severityCounts = countSeverities(items);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-border-subtle bg-card p-3",
        "transition-all hover:border-border hover:bg-card-elevated",
        "text-left",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          <span className="text-body-sm font-medium">{cfg.label}</span>
        </div>
        {worstCfg && <div className={cn("size-2 rounded-full", getSeverityDotBg(worst!))} />}
      </div>
      <div className="flex items-center gap-1.5">
        {severityCounts.map(({ severity, count }) => (
          <span
            key={severity}
            className={cn(
              "flex items-center gap-0.5 text-[10px] tabular-nums",
              SEVERITY_CONFIG[severity].color,
            )}
          >
            <span className={cn("size-1.5 rounded-full", getSeverityDotBg(severity))} />
            {count}
          </span>
        ))}
        {items.length === 0 && <span className="text-[10px] text-muted-foreground">No issues</span>}
      </div>
    </button>
  );
}

function getSeverityDotBg(severity: AuditSeverity): string {
  const map: Record<AuditSeverity, string> = {
    error: "bg-destructive-foreground",
    warning: "bg-warning-foreground",
    hint: "bg-info-foreground",
    pass: "bg-success-foreground",
  };
  return map[severity];
}

function countSeverities(items: AuditItem[]): { severity: AuditSeverity; count: number }[] {
  const order: AuditSeverity[] = ["error", "warning", "hint", "pass"];
  return order
    .map((s) => ({ severity: s, count: items.filter((i) => i.severity === s).length }))
    .filter((e) => e.count > 0);
}
