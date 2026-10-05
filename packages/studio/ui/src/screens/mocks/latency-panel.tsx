import { Timer } from "lucide-react";
import { useState } from "react";

import { RangeSlider } from "@/design/range-slider";
import type { SegmentedOption } from "@/design/segmented";
import { Segmented } from "@/design/segmented";
import { PRESET_VALUES } from "@/features/mocks/latency-config";
import { customWindow, shapeOf } from "@/features/mocks/latency-shape";
import type { Delay } from "@/features/mocks/latency-window";
import { delayOf } from "@/features/mocks/latency-window";
import { setBandwidth, setLatency } from "@/mocks/network-commands";
import type { LatencyDistribution, LatencyPreset, MockServerInfo } from "@/store/mock-slice";
import { LatencyShapeField } from "./latency-shape-field";
import { LatencyWindowBar } from "./latency-window-bar";
import { NetworkCard } from "./network-card";

const PRESETS: readonly { value: LatencyPreset; label: string }[] = [
  { value: "none", label: "None" },
  { value: "3g", label: "3G" },
  { value: "4g", label: "4G" },
  { value: "satellite", label: "Satellite" },
  { value: "custom", label: "Custom" },
];

/* Caps in kilobits a second; 0 is none. */
const BANDWIDTHS: readonly SegmentedOption<string>[] = [
  { value: "0", label: "Unlimited" },
  { value: "512", label: "512 Kbps" },
  { value: "1500", label: "1.5 Mbps" },
  { value: "10000", label: "10 Mbps" },
];

/* A delay of one's own starts from the one in force, in its shape. */
function pick(server: MockServerInfo, preset: LatencyPreset): void {
  const latency = server.networkConfig?.latency;
  const delay = delayOf(latency) ?? delayOf(PRESET_VALUES.custom);
  if (preset !== "custom") setLatency(server, preset, PRESET_VALUES[preset]);
  else if (delay) setLatency(server, "custom", customWindow(delay, shapeOf(latency)));
}

function commit(server: MockServerInfo, delay: Delay, shape: LatencyDistribution): void {
  if (delay.base === 0) setLatency(server, "none", PRESET_VALUES.none);
  else setLatency(server, "custom", customWindow(delay, shape));
}

/* The jitter spreads the window either side of the base, which no delay goes below zero to. */
function withinBase(delay: Delay): Delay {
  return { base: delay.base, jitter: Math.min(delay.jitter, delay.base) };
}

/**
 * The delay the mock adds to its answers: a preset, or a base, jitter and
 * shape of one's own; the window of delays they give; and a cap on how fast
 * bodies are sent.
 *
 * @param props - The mock server, and whether it can take a change
 * @returns The panel
 * @example
 * ```tsx
 * <LatencyPanel server={server} disabled={false} />
 * ```
 */
export function LatencyPanel({
  server,
  disabled,
}: {
  server: MockServerInfo;
  disabled: boolean;
}): React.ReactNode {
  const [draft, setDraft] = useState<Delay | null>(null);
  const latency = server.networkConfig?.latency;
  const shape = shapeOf(latency);
  const shown = draft ?? delayOf(latency) ?? { base: 0, jitter: 0 };
  const settle = (delay: Delay): void => {
    setDraft(null);
    commit(server, withinBase(delay), shape);
  };
  return (
    <NetworkCard
      icon={Timer}
      tone="text-warn"
      title="Latency"
      aside={
        <fieldset disabled={disabled} className="m-0 min-w-0 border-0 p-0">
          <Segmented
            label="Latency preset"
            quiet="subtle"
            options={PRESETS}
            value={server.latencyPreset}
            onChange={(preset) => pick(server, preset)}
          />
        </fieldset>
      }
    >
      <fieldset
        disabled={disabled}
        className="m-0 flex min-w-0 flex-col gap-4.5 border-0 p-4.5 disabled:opacity-50"
      >
        <LatencyWindowBar delay={shown} shape={shown.base ? shape : "uniform"} />
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-control font-strong">Base delay</span>
            <span className="font-mono text-ui">{shown.base}ms</span>
          </div>
          <RangeSlider
            label="Base delay"
            value={shown.base}
            max={2_000}
            step={10}
            onChange={(base) => setDraft(withinBase({ ...shown, base }))}
            onCommit={(base) => settle({ ...shown, base })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-control font-strong">Jitter</span>
            <span className="font-mono text-ui">± {shown.jitter}ms</span>
          </div>
          <RangeSlider
            label="Jitter"
            value={shown.jitter}
            max={Math.max(10, Math.min(1_000, shown.base))}
            step={10}
            disabled={shown.base === 0}
            onChange={(jitter) => setDraft({ ...shown, jitter })}
            onCommit={(jitter) => settle({ ...shown, jitter })}
          />
        </div>
        {server.latencyPreset === "custom" && (
          <LatencyShapeField
            shape={shape}
            onChange={(next) => setLatency(server, "custom", customWindow(shown, next))}
          />
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-control font-strong">Bandwidth</span>
          <Segmented
            label="Bandwidth"
            quiet="subtle"
            options={BANDWIDTHS}
            value={String(server.networkConfig?.bandwidth ?? 0)}
            onChange={(kbps) => setBandwidth(server, Number(kbps))}
          />
        </div>
      </fieldset>
    </NetworkCard>
  );
}
