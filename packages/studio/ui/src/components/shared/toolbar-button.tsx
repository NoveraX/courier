import { KbdHint } from "@/components/shared/kbd-hint";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ToolbarButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  tooltip: string;
  kbd?: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}

export function ToolbarButton({
  icon: Icon,
  tooltip,
  kbd,
  onClick,
  active,
  disabled,
}: ToolbarButtonProps): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClick}
          disabled={disabled}
          aria-label={tooltip}
          className={cn(
            "text-muted-foreground hover:text-foreground",
            active && "bg-accent-brand/10 text-accent-brand",
          )}
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
