import { useState } from "react";
import { Database, RotateCw, Sprout, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { STAGGER_ITEM_VARIANTS } from "@/components/shared/stagger-list";
import { cn } from "@/lib/utils";

import type { MockCollectionEntry } from "@/store/mock-slice";

interface CollectionListProps {
  collections: MockCollectionEntry[];
  active: string | null;
  disabled?: boolean;
  onSelect: (name: string) => void;
  onSeed: (name: string, count: number) => void;
  onClear: (name: string) => void;
  onSeedAll?: (count: number) => void;
}

export function CollectionList({
  collections,
  active,
  disabled,
  onSelect,
  onSeed,
  onClear,
  onSeedAll,
}: CollectionListProps): React.ReactElement {
  const [seedCount, setSeedCount] = useState(20);
  const totalRecords = collections.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="flex w-56 shrink-0 flex-col border-r border-border-subtle">
      <CollectionHeader count={collections.length} totalRecords={totalRecords} />

      <motion.div
        className="flex-1 overflow-y-auto px-2 py-1.5"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.03 } } }}
      >
        {collections.map((col) => (
          <CollectionItem
            key={col.name}
            name={col.name}
            count={col.count}
            isActive={active === col.name}
            disabled={disabled}
            onSelect={() => onSelect(col.name)}
            onSeed={() => onSeed(col.name, seedCount)}
            onClear={() => onClear(col.name)}
          />
        ))}
      </motion.div>

      <div className={cn(disabled && "pointer-events-none opacity-40")}>
        <SeedControls
          seedCount={seedCount}
          onSeedCountChange={setSeedCount}
          onSeedAll={onSeedAll ? () => onSeedAll(seedCount) : undefined}
        />
      </div>
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────

function CollectionHeader({ count, totalRecords }: { count: number; totalRecords: number }): React.ReactElement {
  return (
    <div className="flex items-center gap-2.5 border-b border-border-subtle px-3.5 py-2.5">
      <div className="flex size-6 items-center justify-center rounded-md bg-accent-brand/10">
        <Database className="size-3 text-accent-brand" />
      </div>
      <div className="flex flex-col">
        <span className="text-body-xs font-medium text-foreground">{count} collections</span>
        <span className="text-[10px] tabular-nums text-muted-foreground/50">
          <AnimatedCounter value={totalRecords} className="text-[10px]" /> records
        </span>
      </div>
    </div>
  );
}

// ── Collection Item ──────────────────────────────────────────────────────────

function CollectionItem({
  name,
  count,
  isActive,
  disabled,
  onSelect,
  onSeed,
  onClear,
}: {
  name: string;
  count: number;
  isActive: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onSeed: () => void;
  onClear: () => void;
}): React.ReactElement {
  return (
    <motion.div
      variants={STAGGER_ITEM_VARIANTS}
      className={cn(
        "group relative flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 transition-all",
        "hover:bg-muted/40",
        isActive && "bg-accent-brand/8 before:absolute before:inset-y-1.5 before:left-0.5 before:w-0.5 before:rounded-full before:bg-accent-brand",
      )}
      onClick={onSelect}
    >
      <div className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded transition-colors",
        isActive ? "bg-accent-brand/15 text-accent-brand" : "bg-muted/50 text-muted-foreground/40",
      )}>
        <Database className="size-2.5" />
      </div>

      <span className={cn(
        "flex-1 truncate text-xs transition-colors",
        isActive ? "font-medium text-foreground" : "text-muted-foreground",
      )}>
        {name}
      </span>

      {/* Count — hidden on hover to reveal actions */}
      <span className={cn(
        "shrink-0 tabular-nums text-[10px] transition-opacity group-hover:opacity-0",
        isActive ? "text-accent-brand" : "text-muted-foreground/40",
      )}>
        <AnimatedCounter
          value={count}
          className={cn("text-[10px]", isActive ? "text-accent-brand" : "text-muted-foreground/40")}
        />
      </span>

      {/* Hover actions — overlaid on count, hidden when disabled */}
      <div className={cn("absolute right-2 hidden items-center gap-0.5", !disabled && "group-hover:flex")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-5 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); onSeed(); }}>
              <RotateCw className="size-2.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Re-seed</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-5 text-muted-foreground hover:text-rose-400" onClick={(e) => { e.stopPropagation(); onClear(); }}>
              <Trash2 className="size-2.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Clear</TooltipContent>
        </Tooltip>
      </div>
    </motion.div>
  );
}

// ── Seed Controls ────────────────────────────────────────────────────────────

function SeedControls({
  seedCount,
  onSeedCountChange,
  onSeedAll,
}: {
  seedCount: number;
  onSeedCountChange: (v: number) => void;
  onSeedAll?: () => void;
}): React.ReactElement {
  return (
    <div className="border-t border-border-subtle p-2.5 space-y-2">
      <div className="rounded-lg bg-muted/30 p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sprout className="size-3 text-emerald-400/70" />
            <span className="text-[10px] font-medium text-muted-foreground/70">Seed data</span>
          </div>
          <Input
            type="number"
            min={1}
            max={1000}
            value={seedCount}
            onChange={(e) => onSeedCountChange(Number(e.target.value) || 20)}
            className="h-5 w-12 rounded border-border-subtle/50 bg-background/50 px-1 text-center font-mono text-[10px]"
          />
        </div>
        {onSeedAll && (
          <Button
            size="sm"
            className="h-6 w-full gap-1.5 rounded-md bg-emerald-500/15 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/25"
            onClick={onSeedAll}
          >
            <RotateCw className="size-2.5" />
            Re-seed all collections
          </Button>
        )}
      </div>
    </div>
  );
}
