import { SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { KbdHint } from "@/components/shared/kbd-hint";
import { SearchInput } from "@/components/shared/search-input";

export { SearchInput };

export function FilterToggle({
  active,
  count,
  onClick,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
}): React.ReactElement {
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

export function ToolbarButton({
  icon: Icon,
  tooltip,
  kbd,
  onClick,
  active,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tooltip: string;
  kbd?: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClick}
          disabled={disabled}
          className={cn(active && "text-accent-brand")}
        >
          <Icon className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2">
        {tooltip}
        {kbd && <KbdHint keys={kbd} />}
      </TooltipContent>
    </Tooltip>
  );
}
