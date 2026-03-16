import { Timer, AlertTriangle, Activity, HardDrive } from "lucide-react";

import { SingleSelect } from "@/components/shared/single-select";

import type { SingleSelectOption } from "@/components/shared/single-select";
import type { ExplorerMetricMode } from "../../types";

// ── Options ────────────────────────────────────────────────────────────────

const METRIC_OPTIONS: SingleSelectOption[] = [
  { value: "latency", label: "Latency", icon: Timer },
  { value: "errors", label: "Errors", icon: AlertTriangle },
  { value: "traffic", label: "Traffic", icon: Activity },
  { value: "size", label: "Size", icon: HardDrive },
];

// ── Component ──────────────────────────────────────────────────────────────

interface MetricModeSelectProps {
  value: ExplorerMetricMode;
  onChange: (mode: ExplorerMetricMode) => void;
}

export function MetricModeSelect({ value, onChange }: MetricModeSelectProps): React.ReactElement {
  return (
    <SingleSelect
      options={METRIC_OPTIONS}
      value={value}
      onChange={(v) => onChange(v as ExplorerMetricMode)}
      className="bg-card/90 backdrop-blur-sm"
    />
  );
}
