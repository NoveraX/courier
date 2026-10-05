import { Clock } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { Button } from "@/components/ui/button";
import type { LatencyFormValues } from "@/features/mocks/latency-config";
import { LATENCY_DEFAULTS, PRESET_VALUES } from "@/features/mocks/latency-config";
import { cn } from "@/lib/utils";
import { getSocket } from "@/socket";
import type { LatencyPreset, MockServerInfo } from "@/store/mock-slice";
import { useMockStore } from "@/store/mock-slice";
import { LatencyCustomPanel } from "./latency-custom-panel";
import { BANDWIDTH_OPTIONS, DISTRIBUTION_OPTIONS, LATENCY_PRESETS } from "./latency-presets";

interface LatencyControlsProps {
  server: MockServerInfo;
}

export function LatencyControls({ server }: LatencyControlsProps): React.ReactElement {
  const storePreset = server.latencyPreset;

  // Only local flag: "user picked Custom tab but hasn't Applied yet"
  const [customDraft, setCustomDraft] = useState(false);
  const mode: LatencyPreset = customDraft ? "custom" : storePreset;

  const {
    control,
    setValue,
    reset,
    formState: { isDirty },
  } = useForm<LatencyFormValues>({
    defaultValues: LATENCY_DEFAULTS,
  });
  const showApply = mode === "custom" && (isDirty || customDraft);
  const vals = useWatch({ control });

  const applyLatency = (
    preset: LatencyPreset,
    lat: { min: number; max: number; jitter: number },
  ): void => {
    const distribution = vals.distribution ?? LATENCY_DEFAULTS.distribution;
    const bandwidth = vals.bandwidth ?? LATENCY_DEFAULTS.bandwidth;
    useMockStore.getState().updateServer(server.serverId, {
      latencyPreset: preset,
      latencyStartedAt: Date.now(),
    });
    getSocket().emit("mock:command", {
      action: "mock:network:set",
      serverId: server.serverId,
      config: { latency: { ...lat, distribution }, bandwidth },
      preset,
    });
  };

  const handlePresetChange = (next: LatencyPreset): void => {
    if (next === "custom") {
      setCustomDraft(true);
      return;
    }
    setCustomDraft(false);
    if (next === "none") {
      useMockStore.getState().updateServer(server.serverId, {
        latencyPreset: "none",
        latencyStartedAt: null,
      });
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

  const handleApplyCustom = (): void => {
    applyLatency("custom", {
      min: vals.min ?? LATENCY_DEFAULTS.min,
      max: vals.max ?? LATENCY_DEFAULTS.max,
      jitter: vals.jitter ?? LATENCY_DEFAULTS.jitter,
    });
    reset(vals as LatencyFormValues, { keepValues: true });
    setCustomDraft(false);
  };

  const activeVals =
    mode !== "custom"
      ? PRESET_VALUES[mode]
      : {
          min: vals.min ?? LATENCY_DEFAULTS.min,
          max: vals.max ?? LATENCY_DEFAULTS.max,
          jitter: vals.jitter ?? LATENCY_DEFAULTS.jitter,
        };
  const preview =
    mode === "none"
      ? "0ms"
      : `~${Math.round((activeVals.min + activeVals.max) / 2)}ms ± ${activeVals.jitter}ms`;

  const isActive = storePreset !== "none";

  return (
    <div className="rounded-xl border border-border-subtle bg-card">
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
        <div
          className={cn(
            "flex size-7 items-center justify-center rounded-lg ring-1",
            isActive ? "bg-sky-500/15 ring-sky-500/25" : "bg-muted/40 ring-border-subtle",
          )}
        >
          <Clock
            className={cn("size-3.5", isActive ? "text-sky-400" : "text-muted-foreground/50")}
          />
        </div>
        <div>
          <h3 className="text-body-sm font-semibold text-foreground">Latency Simulation</h3>
          <p className="text-body-xs text-muted-foreground/60">
            Add artificial delay to mock responses
          </p>
        </div>
        <span
          className={cn(
            "ml-auto rounded-md px-2 py-0.5 text-mono-xs tabular-nums transition-colors",
            isActive ? "bg-sky-500/10 text-sky-400" : "bg-muted/40 text-muted-foreground/50",
          )}
        >
          {preview}
        </span>
      </div>

      <div className="space-y-4 p-4">
        <SegmentedControl
          options={LATENCY_PRESETS}
          value={mode}
          onChange={handlePresetChange}
          className="w-full"
          stretch
        />

        {mode === "custom" && <LatencyCustomPanel vals={vals} setValue={setValue} />}

        {mode !== "none" && (
          <div className="space-y-1.5">
            <span className="text-body-xs text-muted-foreground/60">Distribution</span>
            <SegmentedControl
              options={DISTRIBUTION_OPTIONS}
              value={vals.distribution ?? LATENCY_DEFAULTS.distribution}
              onChange={(v) => setValue("distribution", v, { shouldDirty: true })}
              className="w-full"
              stretch
            />
          </div>
        )}

        <div className="space-y-1.5">
          <span className="text-body-xs text-muted-foreground/60">Bandwidth Cap</span>
          <SegmentedControl
            options={BANDWIDTH_OPTIONS}
            value={String(vals.bandwidth ?? LATENCY_DEFAULTS.bandwidth)}
            onChange={(v) => setValue("bandwidth", Number(v), { shouldDirty: true })}
            className="w-full"
            stretch
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
