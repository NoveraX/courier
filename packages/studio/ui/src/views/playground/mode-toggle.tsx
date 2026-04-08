import { Globe, Zap } from "lucide-react";

import { SegmentedControl } from "@/components/shared/segmented-control";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const MODE_OPTIONS = [
  { value: "direct" as const, label: "Direct", icon: Zap },
  { value: "proxy" as const, label: "Proxy", icon: Globe },
];

interface ModeToggleProps {
  mode: "direct" | "proxy";
  onChange: (m: "direct" | "proxy") => void;
}

export function ModeToggle({ mode, onChange }: ModeToggleProps): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div>
          <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={onChange} />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {mode === "direct" ? "Execute directly on server" : "Route through proxy endpoint"}
      </TooltipContent>
    </Tooltip>
  );
}
