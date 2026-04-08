/**
 * Sidebar list of mock store collections.
 *
 * Hosts the header, the staggered list of collection rows and the seed
 * controls panel. The row and seed-controls components live in
 * `collection-item.tsx` and `seed-controls.tsx`.
 */

import { useState } from "react";
import { Database } from "lucide-react";
import { motion } from "motion/react";

import type { MockCollectionEntry } from "@/store/mock-slice";

import { AnimatedCounter } from "@/components/shared/animated-counter";
import { cn } from "@/lib/utils";

import { CollectionItem } from "./collection-item";
import { SeedControls } from "./seed-controls";

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

function CollectionHeader({
  count,
  totalRecords,
}: {
  count: number;
  totalRecords: number;
}): React.ReactElement {
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
