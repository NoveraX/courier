import { Timer } from "lucide-react";
import { useState } from "react";

import { RangeSlider } from "@/design/range-slider";
import type { SegmentedOption } from "@/design/segmented";
import { Segmented } from "@/design/segmented";
import { PRESET_VALUES } from "@/features/mocks/latency-config";
import type { Delay } from "@/features/mocks/latency-window";
import { delayLabel, delayOf, delayWindow } from "@/features/mocks/latency-window";
import { setBandwidth, setLatency } from "@/mocks/network-commands";
import type { LatencyPreset, MockServerInfo } from "@/store/mock-slice";
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

/* A custom delay is a base the mock adds jitter to either way. */
function customRange({ base, jitter }: Delay): { min: number; max: number; jitter: number } {
  return { min: base, max: base, jitter };
}

function pick(server: MockServerInfo, preset: LatencyPreset): void {
  const delay = delayOf(server.networkConfig?.latency) ?? delayOf(PRESET_VALUES.custom);
  if (preset !== "custom") setLatency(server, preset, PRESET_VALUES[preset]);
  else if (delay) setLatency(server, "custom", customRange(delay));
}

function commit(server: MockServerInfo, delay: Delay): void {
  if (delay.base === 0) setLatency(server, "none", PRESET_VALUES.none);
  else setLatency(server, "custom", customRange(delay));
}

/**
 * The delay the mock adds to its answers: a preset or a base and jitter of
 * one's own, the window of delays they give, and a cap on how fast bodies
 * are sent.
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
  const current = delayOf(server.networkConfig?.latency);
  const shown = draft ?? current ?? { base: 0, jitter: 0 };
  const span = delayWindow(shown);
  const settle = (delay: Delay): void => {
    setDraft(null);
    commit(server, delay);
  };
  const presets = (
    <Segmented
      label="Latency preset"
      quiet="subtle"
      options={PRESETS}
      value={server.latencyPreset}
      onChange={(preset) => pick(server, preset)}
    />
  );
  return (
    <NetworkCard
      icon={Timer}
      tone="text-warn"
      title="Latency"
      aside={
        <fieldset disabled={disabled} className="m-0 min-w-0 border-0 p-0">
          {presets}
        </fieldset>
      }
    >
      <fieldset
        disabled={disabled}
        className="m-0 flex min-w-0 flex-col gap-4.5 border-0 p-4.5 disabled:opacity-50"
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-small text-fg-subtle">Response window</span>
            <span className="font-mono text-small">
              {shown.base ? `${delayLabel(span.low)} – ${delayLabel(span.high)}` : "passthrough"}
            </span>
          </div>
          <div
            aria-hidden="true"
            className="relative h-8.5 rounded-card border border-line bg-inset bg-[repeating-linear-gradient(90deg,var(--color-line)_0_1px,transparent_1px_25%)]"
          >
            <span
              className="absolute top-1.5 bottom-1.5 min-w-0.75 rounded-[5px] bg-linear-to-r from-warn/30 via-warn/70 to-warn/30"
              style={{ left: `${span.lowAt}%`, width: `${span.highAt - span.lowAt}%` }}
            />
            <span
              className="absolute top-0.75 bottom-0.75 w-0.5 rounded-[1px] bg-warn"
              style={{ left: `${span.baseAt}%` }}
            />
          </div>
          <div
            aria-hidden="true"
            className="flex justify-between font-mono text-micro text-fg-subtle"
          >
            {["0", "500ms", "1s", "1.5s", "2s+"].map((mark) => (
              <span key={mark}>{mark}</span>
            ))}
          </div>
        </div>
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
            onChange={(base) => setDraft({ ...shown, base })}
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
            max={1_000}
            step={10}
            disabled={shown.base === 0}
            onChange={(jitter) => setDraft({ ...shown, jitter })}
            onCommit={(jitter) => settle({ ...shown, jitter })}
          />
        </div>
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
