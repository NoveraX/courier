import { ZapOff } from "lucide-react";

import { RangeSlider } from "@/design/range-slider";
import type { ChaosFormValues } from "@/features/mocks/chaos-config";
import { cn } from "@/lib/utils";
import type { FaultWeight } from "@/store/mock-slice";
import { NetworkCard } from "./network-card";

const FAULTS: readonly { type: string; label: string; sub: string; fill: string }[] = [
  { type: "500", label: "HTTP 500", sub: "Internal error", fill: "bg-err" },
  {
    type: "503",
    label: "HTTP 503",
    sub: "Service unavailable",
    fill: "bg-[color-mix(in_srgb,var(--color-err)_55%,var(--color-warn))]",
  },
  { type: "timeout", label: "timeout", sub: "Held until it times out · 408", fill: "bg-warn" },
  { type: "reset", label: "reset", sub: "Connection reset", fill: "bg-fg-subtle" },
];

function weightOf(weights: readonly FaultWeight[], type: string): number {
  return weights.find((w) => w.type === type)?.weight ?? 0;
}

interface FaultPanelProps {
  values: ChaosFormValues;
  disabled: boolean;
  /** A slider moved: the values to show. */
  onChange: (values: ChaosFormValues) => void;
  /** A slider let go: the values to send. */
  onCommit: (values: ChaosFormValues) => void;
}

/**
 * Fault injection: the share of answers the mock fails, and how those
 * failures split between server errors, unavailability, timeouts and
 * dropped connections.
 *
 * @param props - The rate and mix, whether the mock can take a change, and what follows a change and a settled one
 * @returns The panel
 * @example
 * ```tsx
 * <FaultPanel values={values} disabled={false} onChange={show} onCommit={send} />
 * ```
 */
export function FaultPanel({
  values,
  disabled,
  onChange,
  onCommit,
}: FaultPanelProps): React.ReactNode {
  const on = values.errorRate > 0;
  const total = Math.max(
    1,
    FAULTS.reduce((sum, f) => sum + weightOf(values.faultWeights, f.type), 0),
  );
  const withWeight = (type: string, weight: number): ChaosFormValues => ({
    ...values,
    faultWeights: FAULTS.map((f) => ({
      type: f.type,
      weight: f.type === type ? weight : weightOf(values.faultWeights, f.type),
    })),
  });
  const pill = (
    <span
      className={cn(
        "flex h-5.5 items-center rounded-full px-2 font-mono text-badge font-semibold",
        on ? "bg-err-dim text-err" : "bg-raised text-fg-subtle",
      )}
    >
      {on ? "ACTIVE" : "OFF"}
    </span>
  );
  return (
    <NetworkCard icon={ZapOff} tone="text-err" title="Fault injection" aside={pill}>
      <fieldset
        disabled={disabled}
        className="m-0 flex min-w-0 flex-col gap-4.5 border-0 p-4.5 disabled:opacity-50"
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-control font-strong">Error rate</span>
            <span
              className={cn(
                "font-mono text-[22px] font-medium tracking-[-0.03em]",
                on ? "text-err" : "text-fg-subtle",
              )}
            >
              {values.errorRate}
              <span className="text-ui text-fg-subtle">%</span>
            </span>
          </div>
          <RangeSlider
            label="Error rate"
            value={values.errorRate}
            max={100}
            tone="risk"
            size="lg"
            onChange={(errorRate) => onChange({ ...values, errorRate })}
            onCommit={(errorRate) => onCommit({ ...values, errorRate })}
          />
          <div
            aria-hidden="true"
            className="flex justify-between font-mono text-micro text-fg-subtle"
          >
            {["0", "25", "50", "75", "100"].map((mark) => (
              <span key={mark}>{mark}</span>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-control font-strong">Fault mix</span>
            <span className="truncate text-label text-fg-subtle">
              relative weight of each failure
            </span>
          </div>
          <div
            aria-hidden="true"
            className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-raised"
          >
            {FAULTS.map((f) => (
              <span
                key={f.type}
                className={cn("transition-[flex] duration-200", f.fill, !on && "opacity-35")}
                style={{ flex: `${weightOf(values.faultWeights, f.type)} 1 0px` }}
              />
            ))}
          </div>
          <div className="flex flex-col overflow-hidden rounded-[11px] border border-line">
            {FAULTS.map((f) => {
              const weight = weightOf(values.faultWeights, f.type);
              return (
                <div
                  key={f.type}
                  className="grid min-h-11.5 grid-cols-[minmax(0,1fr)_minmax(90px,1.2fr)_40px] items-center gap-3.5 border-b border-line px-3.5 last:border-b-0"
                >
                  <span className="flex min-w-0 items-center gap-2.25">
                    <span className={cn("size-2 shrink-0 rounded-[2px]", f.fill)} />
                    <span className="flex min-w-0 flex-col gap-px">
                      <span className="font-mono text-small font-medium">{f.label}</span>
                      <span className="truncate text-badge text-fg-subtle">{f.sub}</span>
                    </span>
                  </span>
                  <RangeSlider
                    size="sm"
                    fill={f.fill}
                    label={`Weight of ${f.label}`}
                    value={weight}
                    max={100}
                    onChange={(w) => onChange(withWeight(f.type, w))}
                    onCommit={(w) => onCommit(withWeight(f.type, w))}
                  />
                  <span className="text-right font-mono text-small text-fg-muted">
                    {Math.round((weight / total) * 100)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </fieldset>
    </NetworkCard>
  );
}
