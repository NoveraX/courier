/**
 * Read-only preview card for a chaos preset (error rate + fault distribution).
 *
 * Extracted from `chaos-controls.tsx` — purely presentational, used when the
 * user has selected a non-custom preset and we want to show the resulting
 * configuration without exposing form controls.
 */

import type { FaultWeight } from "@/store/mock-slice";

interface ChaosPresetPreviewProps {
  errorRate: number;
  faultWeights: FaultWeight[];
}

export function ChaosPresetPreview({
  errorRate,
  faultWeights,
}: ChaosPresetPreviewProps): React.ReactElement {
  const total = faultWeights.reduce((s, f) => s + f.weight, 0) || 1;

  return (
    <div className="space-y-2 rounded-lg border border-border-subtle bg-muted/10 p-3">
      <div className="flex items-center justify-between">
        <span className="text-body-xs text-muted-foreground/70">Error Rate</span>
        <span className="text-mono-xs tabular-nums text-foreground/70">{errorRate}%</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {faultWeights.map((fw) => (
          <span
            key={fw.type}
            className="rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-400 ring-1 ring-rose-500/25"
          >
            {fw.type} {Math.round((fw.weight / total) * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}
