import { useState } from "react";

import { RangeSlider } from "@/design/range-slider";
import { ToggleSwitch } from "@/design/toggle-switch";
import { DEFAULT_STOP } from "@/features/mocks/chaos-config";
import { cn } from "@/lib/utils";
import { setStopConditions } from "@/mocks/network-commands";
import type { MockServerInfo, StopCondition } from "@/store/mock-slice";

type Limit = "errorRateThreshold" | "p99Threshold" | "maxDurationMins";

/* A threshold of 0 is no check. */
const LIMITS: readonly {
  key: Limit;
  label: string;
  max: number;
  step: number;
  text: (stop: StopCondition) => string;
}[] = [
  {
    key: "errorRateThreshold",
    label: "Error rate above",
    max: 100,
    step: 5,
    text: (s) =>
      s.errorRateThreshold ? `${s.errorRateThreshold}% over ${s.errorRateDurationSecs}s` : "off",
  },
  {
    key: "p99Threshold",
    label: "P99 above",
    max: 5_000,
    step: 100,
    text: (s) => (s.p99Threshold ? `${s.p99Threshold}ms over ${s.p99DurationSecs}s` : "off"),
  },
  {
    key: "maxDurationMins",
    label: "Run at most",
    max: 60,
    step: 5,
    text: (s) => (s.maxDurationMins ? `${s.maxDurationMins} min` : "no limit"),
  },
];

/**
 * The thresholds that halt a run on its own: switched on as a whole, each
 * set with a slider and sent once it settles. A threshold of 0 is no check.
 *
 * @param props - The mock server, and whether it can take a change
 * @returns The thresholds
 * @example
 * ```tsx
 * <StopLimits server={server} disabled={false} />
 * ```
 */
export function StopLimits({
  server,
  disabled,
}: {
  server: MockServerInfo;
  disabled: boolean;
}): React.ReactNode {
  const [draft, setDraft] = useState<StopCondition | null>(null);
  const stop = draft ?? server.stopConditions ?? DEFAULT_STOP;
  const send = (next: StopCondition): void => {
    setDraft(null);
    setStopConditions(server, next);
  };
  return (
    <fieldset
      disabled={disabled}
      className="m-0 flex min-w-0 flex-col gap-4 border-0 p-4.5 disabled:opacity-50"
    >
      <div className="flex items-center gap-3">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-control font-strong">Auto-halt</span>
          <span className="text-label text-fg-subtle">
            Stop the run when a threshold is crossed
          </span>
        </span>
        <ToggleSwitch
          label="Auto-halt"
          checked={stop.enabled}
          disabled={disabled}
          onChange={(enabled) => send({ ...stop, enabled })}
        />
      </div>
      {LIMITS.map((limit) => (
        <div key={limit.key} className={cn("flex flex-col gap-2", !stop.enabled && "opacity-50")}>
          <div className="flex items-baseline justify-between">
            <span className="text-small text-fg-subtle">{limit.label}</span>
            <span className="font-mono text-small">{limit.text(stop)}</span>
          </div>
          <RangeSlider
            label={limit.label}
            value={stop[limit.key]}
            max={limit.max}
            step={limit.step}
            disabled={!stop.enabled}
            onChange={(value) => setDraft({ ...stop, [limit.key]: value })}
            onCommit={(value) => send({ ...stop, [limit.key]: value })}
          />
        </div>
      ))}
    </fieldset>
  );
}
