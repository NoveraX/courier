/**
 * Bottom seed-data controls for the mock store sidebar.
 *
 * Renders the seed count input and the "Re-seed all collections" CTA.
 * Pure presentation — the parent owns the seed count state.
 */

import { RotateCw, Sprout } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SeedControlsProps {
  seedCount: number;
  onSeedCountChange: (v: number) => void;
  onSeedAll?: (() => void) | undefined;
}

export function SeedControls({
  seedCount,
  onSeedCountChange,
  onSeedAll,
}: SeedControlsProps): React.ReactElement {
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
