import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Clock, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { cn } from "@/lib/utils";
import { getSocket } from "@/socket";
import { useMockStore } from "@/store/mock-slice";
import { SliderRow } from "./slider-row";

import type { LatencyDistribution, LatencyPreset, MockServerInfo } from "@/store/mock-slice";

interface LatencyControlsProps {
  server: MockServerInfo;
}

interface LatencyFormValues {
  min: number;
  max: number;
  jitter: number;
  distribution: LatencyDistribution;
  bandwidth: number;
}

const LATENCY_PRESETS = [
  { value: "none" as const, label: "Off", icon: Gauge },
  { value: "3g" as const, label: "3G · 450ms" },
  { value: "4g" as const, label: "4G · 120ms" },
  { value: "satellite" as const, label: "Satellite · 700ms" },
  { value: "custom" as const, label: "Custom", icon: Clock },
];

const PRESET_VALUES: Record<LatencyPreset, { min: number; max: number; jitter: number }> = {
  none: { min: 0, max: 0, jitter: 0 },
  "3g": { min: 300, max: 600, jitter: 100 },
  "4g": { min: 80, max: 160, jitter: 30 },
  satellite: { min: 600, max: 800, jitter: 150 },
  custom: { min: 300, max: 600, jitter: 50 },
};

const DISTRIBUTION_OPTIONS = [
  { value: "uniform" as const, label: "Uniform" },
  { value: "normal" as const, label: "Normal" },
  { value: "log-normal" as const, label: "Log-Normal" },
];

const BANDWIDTH_OPTIONS = [
  { value: "0" as const, label: "∞ Unlimited" },
  { value: "512" as const, label: "512 Kbps" },
  { value: "1500" as const, label: "1.5 Mbps" },
  { value: "10000" as const, label: "10 Mbps" },
];

const DEFAULTS: LatencyFormValues = { min: 300, max: 600, jitter: 50, distribution: "log-normal", bandwidth: 0 };

export function LatencyControls({ server }: LatencyControlsProps): React.ReactElement {
  const storePreset = server.latencyPreset;

  // Only local flag: "user picked Custom tab but hasn't Applied yet"
  const [customDraft, setCustomDraft] = useState(false);
  const mode: LatencyPreset = customDraft ? "custom" : storePreset;

  const { control, setValue, reset, formState: { isDirty } } = useForm<LatencyFormValues>({
    defaultValues: DEFAULTS,
  });
  const showApply = mode === "custom" && (isDirty || customDraft);
  const vals = useWatch({ control });

  const handlePresetChange = (next: LatencyPreset) => {
    if (next === "custom") {
      setCustomDraft(true);
      return;
    }
    setCustomDraft(false);
    if (next === "none") {
      useMockStore.getState().updateServer(server.serverId, { latencyPreset: "none", latencyStartedAt: null });
      getSocket().emit("mock:command", {
        action: "mock:network:set",
        serverId: server.serverId,
        config: { latency: 0, bandwidth: 0 },
        preset: "none",
      });
      return;
    }
    applyLatency(next, PRESET_VALUES[next]);
  };

  const handleApplyCustom = () => {
    applyLatency("custom", { min: vals.min ?? DEFAULTS.min, max: vals.max ?? DEFAULTS.max, jitter: vals.jitter ?? DEFAULTS.jitter });
    reset(vals as LatencyFormValues, { keepValues: true });
    setCustomDraft(false);
  };

  const applyLatency = (preset: LatencyPreset, lat: { min: number; max: number; jitter: number }) => {
    const distribution = vals.distribution ?? DEFAULTS.distribution;
    const bandwidth = vals.bandwidth ?? DEFAULTS.bandwidth;
    useMockStore.getState().updateServer(server.serverId, { latencyPreset: preset, latencyStartedAt: Date.now() });
    getSocket().emit("mock:command", {
      action: "mock:network:set",
      serverId: server.serverId,
      config: { latency: { ...lat, distribution }, bandwidth },
      preset,
    });
  };

  const activeVals = mode !== "custom"
    ? PRESET_VALUES[mode]
    : { min: vals.min ?? DEFAULTS.min, max: vals.max ?? DEFAULTS.max, jitter: vals.jitter ?? DEFAULTS.jitter };
  const preview = mode === "none"
    ? "0ms"
    : `~${Math.round((activeVals.min + activeVals.max) / 2)}ms ± ${activeVals.jitter}ms`;

  const isActive = storePreset !== "none";

  return (
    <div className="rounded-xl border border-border-subtle bg-card">
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
        <div className={cn(
          "flex size-7 items-center justify-center rounded-lg ring-1",
          isActive ? "bg-sky-500/15 ring-sky-500/25" : "bg-muted/40 ring-border-subtle",
        )}>
          <Clock className={cn("size-3.5", isActive ? "text-sky-400" : "text-muted-foreground/50")} />
        </div>
        <div>
          <h3 className="text-body-sm font-semibold text-foreground">Latency Simulation</h3>
          <p className="text-body-xs text-muted-foreground/60">Add artificial delay to mock responses</p>
        </div>
        <span className={cn(
          "ml-auto rounded-md px-2 py-0.5 text-mono-xs tabular-nums transition-colors",
          isActive ? "bg-sky-500/10 text-sky-400" : "bg-muted/40 text-muted-foreground/50",
        )}>
          {preview}
        </span>
      </div>

      <div className="space-y-4 p-4">
        <SegmentedControl options={LATENCY_PRESETS} value={mode} onChange={handlePresetChange} className="w-full" stretch />

        {mode === "custom" && (
          <div className="space-y-3 rounded-lg border border-border-subtle bg-muted/10 p-3">
            <SliderRow label="Min" value={vals.min ?? DEFAULTS.min} onChange={(v) => { setValue("min", v, { shouldDirty: true }); if (v > (vals.max ?? DEFAULTS.max)) setValue("max", v, { shouldDirty: true }); }} max={2000} unit="ms" />
            <SliderRow label="Max" value={vals.max ?? DEFAULTS.max} onChange={(v) => { setValue("max", v, { shouldDirty: true }); if (v < (vals.min ?? DEFAULTS.min)) setValue("min", v, { shouldDirty: true }); }} min={vals.min ?? DEFAULTS.min} max={5000} unit="ms" />
            <SliderRow label="Jitter" value={vals.jitter ?? DEFAULTS.jitter} onChange={(v) => setValue("jitter", v, { shouldDirty: true })} max={500} unit="ms" />
          </div>
        )}

        {mode !== "none" && (
          <div className="space-y-1.5">
            <span className="text-body-xs text-muted-foreground/60">Distribution</span>
            <SegmentedControl
              options={DISTRIBUTION_OPTIONS}
              value={vals.distribution ?? DEFAULTS.distribution}
              onChange={(v) => setValue("distribution", v, { shouldDirty: true })}
              className="w-full" stretch
            />
          </div>
        )}

        <div className="space-y-1.5">
          <span className="text-body-xs text-muted-foreground/60">Bandwidth Cap</span>
          <SegmentedControl
            options={BANDWIDTH_OPTIONS}
            value={String(vals.bandwidth ?? DEFAULTS.bandwidth)}
            onChange={(v) => setValue("bandwidth", Number(v), { shouldDirty: true })}
            className="w-full" stretch
          />
        </div>

        {showApply && (
          <Button
            size="sm"
            className="h-7 w-full gap-1.5 bg-accent-brand px-3 text-xs font-medium text-white hover:bg-accent-brand/90"
            onClick={handleApplyCustom}
          >
            Apply Latency
          </Button>
        )}
      </div>
    </div>
  );
}
