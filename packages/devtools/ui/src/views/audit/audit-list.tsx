import { motion } from "motion/react";

import { Badge } from "../../components/ui/badge";
import { useDevToolsStore } from "../../store";
import { CATEGORY_CONFIG, CATEGORY_ORDER } from "./constants";
import type { AuditCategory, AuditItem } from "./types";
import { AuditItemCard } from "./audit-item";

interface AuditListProps {
  items: AuditItem[];
}

export function AuditList({ items }: AuditListProps): React.ReactNode {
  const expandedIds = useDevToolsStore((s) => s.auditExpandedIds);
  const toggleExpanded = useDevToolsStore((s) => s.toggleAuditExpanded);

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

      <div className="space-y-1.5">
        {items.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03, duration: 0.15 }}
          >
            <AuditItemCard
              item={item}
              expanded={expandedIds.has(item.id)}
              onToggle={() => onToggle(item.id)}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function groupByCategory(
  items: AuditItem[],
): Map<AuditCategory, AuditItem[]> {
  const map = new Map<AuditCategory, AuditItem[]>();
  for (const item of items) {
    const list = map.get(item.category) ?? [];
    list.push(item);
    map.set(item.category, list);
  }
  return map;
}
