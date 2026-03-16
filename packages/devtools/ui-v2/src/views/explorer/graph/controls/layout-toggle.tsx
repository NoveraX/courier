import type { ExplorerLayout } from "../../types";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ArrowRightFromLine, ArrowDownFromLine } from "lucide-react";

interface LayoutToggleProps {
  value: ExplorerLayout;
  onChange: (value: ExplorerLayout) => void;
}

export function LayoutToggle({ value, onChange }: LayoutToggleProps): React.ReactElement {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => {
        if (v) onChange(v as ExplorerLayout);
      }}
      variant="outline"
      size="sm"
      className="h-7"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <ToggleGroupItem value="LR" aria-label="Horizontal layout" className="h-7 px-2">
            <ArrowRightFromLine className="size-3.5" />
          </ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent side="bottom">Horizontal (Left → Right)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <ToggleGroupItem value="TB" aria-label="Vertical layout" className="h-7 px-2">
            <ArrowDownFromLine className="size-3.5" />
          </ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent side="bottom">Vertical (Top → Bottom)</TooltipContent>
      </Tooltip>
    </ToggleGroup>
  );
}
