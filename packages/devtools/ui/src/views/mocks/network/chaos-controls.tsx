import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { AlertTriangle, ChevronDown, ChevronRight, Flame, SlidersHorizontal } from "lucide-react";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { cn } from "@/lib/utils";
import { getSocket } from "@/socket";
import { useMockStore } from "@/store/mock-slice";
import { FaultConfigPanel } from "./fault-config";
import { StopConditionsPanel } from "./stop-conditions";

import type { ChaosPreset, FaultWeight, MockServerInfo, StopCondition } from "@/store/mock-slice";

interface ChaosControlsProps {
  server: MockServerInfo;
}

type ChaosMode = "stable" | "degraded" | "unstable" | "down" | "custom";

interface ChaosFormValues {
  errorRate: number;
  faultWeights: FaultWeight[];
}

const CHAOS_PRESETS = [
  { value: "stable" as const, label: "Stable" },
  { value: "degraded" as const, label: "Degraded" },
  { value: "unstable" as const, label: "Unstable" },
  { value: "down" as const, label: "Down", icon: Flame },
  { value: "custom" as const, label: "Custom", icon: SlidersHorizontal },
];

const PRESET_CONFIG: Record<string, { errorRate: number; faultWeights: FaultWeight[] }> = {
  stable: { errorRate: 0, faultWeights: [] },
  degraded: { errorRate: 10, faultWeights: [{ type: "500", weight: 60 }, { type: "timeout", weight: 40 }] },
  unstable: { errorRate: 40, faultWeights: [{ type: "500", weight: 40 }, { type: "503", weight: 30 }, { type: "timeout", weight: 20 }, { type: "reset", weight: 10 }] },
  down: { errorRate: 100, faultWeights: [{ type: "503", weight: 100 }] },
};

const DEFAULT_STOP: StopCondition = {
  enabled: false,
  errorRateThreshold: 30,
  errorRateDurationSecs: 30,
  p99Threshold: 2000,
  p99DurationSecs: 60,
  maxDurationMins: 0,
};

const FORM_DEFAULTS: ChaosFormValues = {
  errorRate: 30,
  faultWeights: [{ type: "500", weight: 50 }, { type: "503", weight: 30 }, { type: "timeout", weight: 20 }],
};

export function ChaosControls({ server }: ChaosControlsProps): React.ReactElement {
  const storePreset = server.chaosPreset;

  // Only local flag: "user picked Custom tab but hasn't Applied yet"
  const [customDraft, setCustomDraft] = useState(false);
  const mode: ChaosMode = customDraft ? "custom" : (storePreset === "none" ? "stable" : storePreset);

  const [stopConditions, setStopConditions] = useState<StopCondition>(
    server.stopConditions ?? DEFAULT_STOP,
  );
  const [stopOpen, setStopOpen] = useState(false);

  const { control, setValue, reset, formState: { isDirty } } = useForm<ChaosFormValues>({
    defaultValues: FORM_DEFAULTS,
  });
  const showApply = mode === "custom" && (isDirty || customDraft);
  const rawVals = useWatch({ control });
  // useWatch returns DeepPartial — cast back since defaults are always present
  const vals = rawVals as ChaosFormValues;

  const sendConfig = (rate: number, weights: FaultWeight[], preset: ChaosMode) => {
    const resolved: ChaosPreset = rate === 0 || preset === "stable" ? "none" : preset;
    useMockStore.getState().updateServer(server.serverId, {
      chaosPreset: resolved,
      chaosStartedAt: rate > 0 ? Date.now() : null,
    });
    getSocket().emit("mock:command", {
      action: "mock:chaos:set",
      serverId: server.serverId,
      config: { errorRate: rate / 100, faultWeights: weights, stopConditions },
      preset: resolved,
    });
  };

  const handlePresetChange = (next: ChaosMode) => {
    if (next === "custom") {
      setCustomDraft(true);
      return;
    }
    setCustomDraft(false);
    const cfg = PRESET_CONFIG[next] ?? PRESET_CONFIG.stable;
    sendConfig(cfg.errorRate, cfg.faultWeights, next);
  };

  const handleApplyCustom = () => {
    const rate = vals.errorRate ?? FORM_DEFAULTS.errorRate;
    const weights = vals.faultWeights ?? FORM_DEFAULTS.faultWeights;
    sendConfig(rate, weights, "custom");
    reset(vals as ChaosFormValues, { keepValues: true });
    setCustomDraft(false);
  };

  const handleToggleFault = (type: string) => {
    const prev = vals.faultWeights ?? FORM_DEFAULTS.faultWeights;
    const next = prev.find((f) => f.type === type)
      ? prev.filter((f) => f.type !== type)
      : [...prev, { type, weight: 20 }];
    setValue("faultWeights", next, { shouldDirty: true });
  };

  const handleAdjustWeight = (type: string, weight: number) => {
    const prev = vals.faultWeights ?? FORM_DEFAULTS.faultWeights;
    const existing = prev.find((f) => f.type === type);
    const next = existing
      ? prev.map((f) => f.type === type ? { ...f, weight } : f)
      : [...prev, { type, weight }];
    setValue("faultWeights", next, { shouldDirty: true });
  };

  const activeCfg = PRESET_CONFIG[mode];
  const isActive = storePreset !== "none";
  const appliedCfg = PRESET_CONFIG[storePreset];
  // Show draft rate for custom (even before Apply), applied rate for presets
  const displayRate = mode === "custom"
    ? (vals.errorRate ?? FORM_DEFAULTS.errorRate)
    : isActive ? (appliedCfg?.errorRate ?? 0) : 0;

  return (
    <div className="rounded-xl border border-border-subtle bg-card">
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
        <div className={cn(
          "flex size-7 items-center justify-center rounded-lg ring-1",
          isActive ? "bg-rose-500/15 ring-rose-500/25" : "bg-muted/40 ring-border-subtle",
        )}>
          <AlertTriangle className={cn("size-3.5", isActive ? "text-rose-400" : "text-muted-foreground/50")} />
        </div>
        <div>
          <h3 className="text-body-sm font-semibold text-foreground">Chaos Engineering</h3>
          <p className="text-body-xs text-muted-foreground/60">Inject faults to test error handling</p>
        </div>
        <span className={cn(
          "ml-auto rounded-md px-2 py-0.5 text-mono-xs tabular-nums",
          isActive ? "bg-rose-500/10 text-rose-400" : "bg-muted/40 text-muted-foreground/50",
        )}>
          {displayRate}%
        </span>
      </div>

      <div className="space-y-4 p-4">
        <SegmentedControl options={CHAOS_PRESETS} value={mode} onChange={handlePresetChange} className="w-full" stretch />

        {/* Read-only preset preview */}
        {mode !== "stable" && mode !== "custom" && activeCfg && (
          <PresetPreview errorRate={activeCfg.errorRate} faultWeights={activeCfg.faultWeights} />
        )}

        {/* Editable panel for custom mode */}
        {mode === "custom" && (
          <FaultConfigPanel
            errorRate={vals.errorRate ?? FORM_DEFAULTS.errorRate}
            onErrorRateChange={(v) => setValue("errorRate", v, { shouldDirty: true })}
            faultWeights={vals.faultWeights ?? FORM_DEFAULTS.faultWeights}
            onToggleFault={handleToggleFault}
            onAdjustWeight={handleAdjustWeight}
            onApply={handleApplyCustom}
            dirty={showApply}
          />
        )}

        {/* Stop conditions */}
        <button
          type="button"
          onClick={() => setStopOpen((v) => !v)}
          className="flex w-full items-center gap-1.5 text-body-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          {stopOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          Auto-Halt Conditions
          <span className={cn(
            "ml-auto rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 ring-1 ring-emerald-500/20 transition-opacity dark:text-emerald-400",
            stopConditions.enabled ? "opacity-100" : "opacity-0",
          )}>ON</span>
        </button>

        {stopOpen && (
          <StopConditionsPanel value={stopConditions} onChange={setStopConditions} />
        )}
      </div>
    </div>
  );
}

// ── Preset Preview ────────────────────────────────────────────────────────────

function PresetPreview({ errorRate, faultWeights }: { errorRate: number; faultWeights: FaultWeight[] }): React.ReactElement {
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
