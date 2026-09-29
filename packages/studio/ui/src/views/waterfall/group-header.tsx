import { ChevronDown } from "lucide-react";
import { formatDuration } from "@/components/shared/formatters";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { GroupedRows } from "./types";

interface GroupHeaderProps {
  group: GroupedRows;
  isCollapsed: boolean;
  onToggle: () => void;
}

export function GroupHeader({
  group,
  isCollapsed,
  onToggle,
}: GroupHeaderProps): React.ReactElement {
  const avgDuration =
    group.rows.length > 0
      ? group.rows.reduce((sum, r) => sum + r.totalDuration, 0) / group.rows.length
      : 0;

  const proxyCount = group.rows.filter((r) => r.isProxy).length;
  const directCount = group.rows.length - proxyCount;

  return (
    <button
      type="button"
      className="flex h-8 w-full items-center gap-2 border-b border-border-subtle bg-muted/30 px-3 text-left transition-colors hover:bg-muted/50"
      onClick={onToggle}
    >
      <ChevronDown
        className={cn(
          "size-3.5 text-muted-foreground transition-transform",
          isCollapsed && "-rotate-90",
        )}
      />

      <span className="text-body-sm font-medium text-foreground">{group.label}</span>

      <Badge variant="secondary" className="text-[10px]">
        {group.rows.length}
      </Badge>

      {proxyCount > 0 && directCount > 0 && (
        <>
          <Badge variant="sky" className="text-[9px]">
            {directCount} direct
          </Badge>
          <Badge variant="indigo" className="text-[9px]">
            {proxyCount} proxy
          </Badge>
        </>
      )}

      <span className="ml-auto text-caption text-muted-foreground tabular-nums">
        avg {formatDuration(avgDuration)}
      </span>
    </button>
  );
}
