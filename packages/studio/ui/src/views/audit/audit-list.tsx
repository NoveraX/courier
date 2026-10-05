import { CATEGORY_ORDER } from "@/features/audit/audit-meta";
import type { AuditCategory, AuditItem } from "@/features/audit/types";
import { StaggerItem, StaggerList } from "../../components/shared/stagger-list";
import { Badge } from "../../components/ui/badge";
import { useStudioStore } from "../../store";
import { AuditItemCard } from "./audit-item";
import { CATEGORY_CONFIG } from "./constants";

interface AuditListProps {
  items: AuditItem[];
}

export function AuditList({ items }: AuditListProps): React.ReactNode {
  const expandedIds = useStudioStore((s) => s.auditExpandedIds);
  const toggleExpanded = useStudioStore((s) => s.toggleAuditExpanded);

  const grouped = groupByCategory(items);

  return (
    <div className="space-y-4">
      {CATEGORY_ORDER.map((cat) => {
        const catItems = grouped.get(cat);
        if (!catItems || catItems.length === 0) return null;

        return (
          <CategorySection
            key={cat}
            category={cat}
            items={catItems}
            expandedIds={expandedIds}
            onToggle={toggleExpanded}
          />
        );
      })}
    </div>
  );
}

function CategorySection({
  category,
  items,
  expandedIds,
  onToggle,
}: {
  category: AuditCategory;
  items: AuditItem[];
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
}): React.ReactNode {
  const cfg = CATEGORY_CONFIG[category];
  const Icon = cfg.icon;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Icon className="size-3.5 text-muted-foreground" />
        <span className="text-body-sm font-semibold">{cfg.label}</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {items.length}
        </Badge>
      </div>

      <StaggerList className="space-y-1.5">
        {items.map((item) => (
          <StaggerItem key={item.id}>
            <AuditItemCard
              item={item}
              expanded={expandedIds.has(item.id)}
              onToggle={() => onToggle(item.id)}
            />
          </StaggerItem>
        ))}
      </StaggerList>
    </div>
  );
}

function groupByCategory(items: AuditItem[]): Map<AuditCategory, AuditItem[]> {
  const map = new Map<AuditCategory, AuditItem[]>();
  for (const item of items) {
    const list = map.get(item.category) ?? [];
    list.push(item);
    map.set(item.category, list);
  }
  return map;
}
