/**
 * Quality pill (R / V / S) rendered in RegistryCard footer rows.
 *
 * Extracted from the card layout so colours and sizing rules can evolve
 * independently of the surrounding component.
 */

import type { ComponentType } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface QualityPillProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  count: number;
  total: number;
  tooltip: string;
}

export function QualityPill({
  icon: PillIcon,
  label,
  count,
  total,
  tooltip,
}: QualityPillProps): React.ReactElement {
  const allCovered = total > 0 && count === total;
  const showFraction = total > 0 && count !== total;
  const color = allCovered
    ? "text-emerald-400 bg-emerald-500/10"
    : count > 0
      ? "text-amber-400 bg-amber-500/10"
      : "text-zinc-500 bg-zinc-500/10";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${color}`}
        >
          <PillIcon className="size-2.5" />
          {label}
          {showFraction ? ` ${count}/${total}` : ""}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {tooltip}: {count} of {total}
      </TooltipContent>
    </Tooltip>
  );
}
