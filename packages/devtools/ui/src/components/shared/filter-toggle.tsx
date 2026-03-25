import { SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface FilterToggleProps {
  active: boolean;
  count: number;
  onClick: () => void;
}

export function FilterToggle({
  active,
  count,
  onClick,
}: FilterToggleProps): React.ReactElement {
  return (
    <Button
      variant={active ? "secondary" : "ghost"}
      size="xs"
      onClick={onClick}
      className={cn("gap-1.5", active && "bg-accent-brand/10 text-accent-brand")}
    >
      <SlidersHorizontal className="size-3.5" />
      Filters
      {count > 0 && (
        <Badge variant="default" className="ml-0.5 h-4 min-w-4 px-1 text-[10px]">
          {count}
        </Badge>
      )}
    </Button>
  );
}
