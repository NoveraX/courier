/**
 * Single collection row in the mock store sidebar.
 *
 * Owns the active highlight, hover-revealed seed/clear actions and
 * animated record count.
 */

import { Database, RotateCw, Trash2 } from "lucide-react";
import { motion } from "motion/react";

import { AnimatedCounter } from "@/components/shared/animated-counter";
import { STAGGER_ITEM_VARIANTS } from "@/components/shared/stagger-list";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface CollectionItemProps {
  name: string;
  count: number;
  isActive: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onSeed: () => void;
  onClear: () => void;
}

export function CollectionItem({
  name,
  count,
  isActive,
  disabled,
  onSelect,
  onSeed,
  onClear,
}: CollectionItemProps): React.ReactElement {
  return (
    <motion.div
      variants={STAGGER_ITEM_VARIANTS}
      className={cn(
        "group relative flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 transition-all",
        "hover:bg-muted/40",
        isActive &&
          "bg-accent-brand/8 before:absolute before:inset-y-1.5 before:left-0.5 before:w-0.5 before:rounded-full before:bg-accent-brand",
      )}
      onClick={onSelect}
    >
      <div
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded transition-colors",
          isActive
            ? "bg-accent-brand/15 text-accent-brand"
            : "bg-muted/50 text-muted-foreground/40",
        )}
      >
        <Database className="size-2.5" />
      </div>

      <span
        className={cn(
          "flex-1 truncate text-xs transition-colors",
          isActive ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {name}
      </span>

      {/* Count — hidden on hover to reveal actions */}
      <span
        className={cn(
          "shrink-0 tabular-nums text-[10px] transition-opacity group-hover:opacity-0",
          isActive ? "text-accent-brand" : "text-muted-foreground/40",
        )}
      >
        <AnimatedCounter
          value={count}
          className={cn("text-[10px]", isActive ? "text-accent-brand" : "text-muted-foreground/40")}
        />
      </span>

      {/* Hover actions — overlaid on count, hidden when disabled */}
      <div
        className={cn(
          "absolute right-2 hidden items-center gap-0.5",
          !disabled && "group-hover:flex",
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Re-seed ${name}`}
              className="size-5 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onSeed();
              }}
            >
              <RotateCw className="size-2.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Re-seed</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Clear ${name}`}
              className="size-5 text-muted-foreground hover:text-rose-400"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
            >
              <Trash2 className="size-2.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Clear</TooltipContent>
        </Tooltip>
      </div>
    </motion.div>
  );
}
