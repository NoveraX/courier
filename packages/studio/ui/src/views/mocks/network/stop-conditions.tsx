import { Switch } from "@/components/ui/switch";
import { SliderRow } from "./slider-row";

import type { StopCondition } from "@/store/mock-slice";

interface StopConditionsPanelProps {
  value: StopCondition;
  onChange: (v: StopCondition) => void;
}

export function StopConditionsPanel({ value, onChange }: StopConditionsPanelProps): React.ReactElement {
  return (
    <div className="space-y-3 rounded-lg border border-border-subtle bg-muted/30 p-3">
      <label className="flex items-center gap-2 text-body-xs text-muted-foreground/70">
        <Switch
          size="sm"
          checked={value.enabled}
          onCheckedChange={(checked) => onChange({ ...value, enabled: !!checked })}
        />
        Enable auto-halt
      </label>
      {value.enabled && (
        <div className="space-y-2">
          <SliderRow
            label="Error rate >"
            sub={`for ${value.errorRateDurationSecs}s`}
            value={value.errorRateThreshold}
            unit="%"
            max={100}
            step={5}
            onChange={(v) => onChange({ ...value, errorRateThreshold: v })}
          />
          <SliderRow
            label="P99 latency >"
            sub={`for ${value.p99DurationSecs}s`}
            value={value.p99Threshold}
            unit="ms"
            max={5000}
            step={100}
            onChange={(v) => onChange({ ...value, p99Threshold: v })}
          />
          <SliderRow
            label="Max duration"
            sub="mins (0 = unlimited)"
            value={value.maxDurationMins}
            unit="min"
            max={60}
            step={5}
            onChange={(v) => onChange({ ...value, maxDurationMins: v })}
          />
        </div>
      )}
    </div>
  );
}
