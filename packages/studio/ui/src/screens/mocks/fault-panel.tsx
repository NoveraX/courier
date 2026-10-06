import { ZapOff } from "lucide-react";

import { RangeSlider } from "@/design/range-slider";
import type { ChaosFormValues } from "@/features/mocks/chaos-config";
import { faultLook } from "@/features/mocks/fault-catalogue";
import { cn } from "@/lib/utils";
import { AddFaultMenu } from "./add-fault-menu";
import { FaultMixRow } from "./fault-mix-row";
import { NetworkCard } from "./network-card";

/* The weight a fault added to the mix starts at. */
const ADDED_WEIGHT = 20;

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
 * failures split between the faults in its mix — any server or client
 * error status, a timeout, a dropped connection, an upload cut off — each
 * added from a menu and taken out again.
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
  const mix = values.faultWeights;
  const total = Math.max(
    1,
    mix.reduce((sum, f) => sum + f.weight, 0),
  );
  const withWeight = (type: string, weight: number): ChaosFormValues => ({
    ...values,
    faultWeights: mix.map((f) => (f.type === type ? { type, weight } : f)),
  });
  const withMix = (faultWeights: ChaosFormValues["faultWeights"]): ChaosFormValues => ({
    ...values,
    faultWeights,
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
            {mix.map((f) => (
              <span
                key={f.type}
                className={cn(
                  "transition-[flex] duration-200",
                  faultLook(f.type).fill,
                  !on && "opacity-35",
                )}
                style={{ flex: `${f.weight} 1 0px` }}
              />
            ))}
          </div>
          <div className="flex flex-col overflow-hidden rounded-[11px] border border-line">
            {mix.map((f) => (
              <FaultMixRow
                key={f.type}
                type={f.type}
                weight={f.weight}
                share={Math.round((f.weight / total) * 100)}
                removable={mix.length > 1}
                onWeight={(w) => onChange(withWeight(f.type, w))}
                onWeightSettled={(w) => onCommit(withWeight(f.type, w))}
                onRemove={() => onCommit(withMix(mix.filter((other) => other.type !== f.type)))}
              />
            ))}
          </div>
          <AddFaultMenu
            taken={mix.map((f) => f.type)}
            onAdd={(type) => onCommit(withMix([...mix, { type, weight: ADDED_WEIGHT }]))}
          />
        </div>
      </fieldset>
    </NetworkCard>
  );
}
