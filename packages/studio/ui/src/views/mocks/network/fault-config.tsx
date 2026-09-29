import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { FaultWeight } from "@/store/mock-slice";
import { SliderRow } from "./slider-row";

const ALL_FAULT_TYPES = ["500", "502", "503", "timeout", "reset"] as const;

interface FaultConfigPanelProps {
  errorRate: number;
  onErrorRateChange: (v: number) => void;
  faultWeights: FaultWeight[];
  onToggleFault: (type: string) => void;
  onAdjustWeight: (type: string, weight: number) => void;
  onApply: () => void;
  /** When false, the Apply button is hidden (already applied) */
  dirty?: boolean;
}

export function FaultConfigPanel({
  errorRate,
  onErrorRateChange,
  faultWeights,
  onToggleFault,
  onAdjustWeight,
  onApply,
  dirty = true,
}: FaultConfigPanelProps): React.ReactElement {
  const totalWeight = useMemo(
    () => faultWeights.reduce((sum, f) => sum + f.weight, 0) || 1,
    [faultWeights],
  );

  return (
    <div className="space-y-3 rounded-lg border border-border-subtle bg-muted/10 p-3">
      <SliderRow
        label="Error Rate"
        value={errorRate}
        onChange={onErrorRateChange}
        max={100}
        step={5}
        unit="%"
      />

      {/* Weighted fault distribution */}
      <div className="space-y-1.5">
        <span className="text-body-xs text-muted-foreground/70">Fault Distribution</span>
        <div className="space-y-2">
          {ALL_FAULT_TYPES.map((type) => {
            const fw = faultWeights.find((f) => f.type === type);
            const active = !!fw;
            const pct = active ? Math.round((fw.weight / totalWeight) * 100) : 0;
            return (
              <div key={type} className={cn("flex items-center gap-2", !active && "opacity-40")}>
                <button
                  type="button"
                  onClick={() => onToggleFault(type)}
                  className={cn(
                    "w-14 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 transition-colors",
                    active
                      ? "bg-rose-500/10 text-rose-400 ring-rose-500/25"
                      : "bg-muted/30 text-muted-foreground/60 ring-border-subtle",
                  )}
                >
                  {type}
                </button>
                <Slider
                  className="min-w-0 flex-1"
                  value={[fw?.weight ?? 0]}
                  onValueChange={([v]) => {
                    if (!active) onToggleFault(type);
                    onAdjustWeight(type, v ?? 5);
                  }}
                  min={0}
                  max={100}
                  step={5}
                  disabled={!active}
                />
                <span className="w-10 shrink-0 text-right text-mono-xs text-muted-foreground/60 tabular-nums">
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {dirty && (
        <Button
          size="sm"
          className="h-7 w-full gap-1.5 bg-accent-brand px-3 text-xs font-medium text-white hover:bg-accent-brand/90"
          onClick={onApply}
        >
          Apply Chaos
        </Button>
      )}
    </div>
  );
}
