import { RotateCcw } from "lucide-react";
import { useState } from "react";

import { RangeSlider } from "@/design/range-slider";
import { delayOf } from "@/features/mocks/latency-window";
import { withFaults } from "@/features/mocks/route-override-rules";
import type { OverrideField } from "@/features/mocks/route-overrides";
import { setsAnything, withGlobalField, withOwnField } from "@/features/mocks/route-overrides";
import { cn } from "@/lib/utils";
import type { RouteOverride } from "@/store/mock-slice";
import { RouteFaultsRow } from "./route-faults-row";
import { RouteUploadRows } from "./route-upload-rows";

/** What a route takes for a setting it has none of its own for. */
export interface GlobalSettings {
  /** The global delay's base, in ms */
  delay: number;
  /** The global error rate, in percent */
  rate: number;
}

interface RouteOverrideEditorProps {
  override: RouteOverride;
  global: GlobalSettings;
  /** A slider let go, a setting taken back, or the override cleared: the override to send. */
  onCommit: (override: RouteOverride) => void;
}

const FIELDS: readonly {
  field: OverrideField;
  label: string;
  name: string;
  max: number;
  step: number;
  tone?: "risk";
  format: (value: number) => string;
}[] = [
  {
    field: "delay",
    label: "Delay",
    name: "Route delay",
    max: 2_000,
    step: 10,
    format: (v) => `+${v}ms`,
  },
  {
    field: "rate",
    label: "Error rate",
    name: "Route error rate",
    max: 100,
    step: 5,
    tone: "risk",
    format: (v) => `${v}%`,
  },
];

function ownValue(override: RouteOverride, field: OverrideField): number | undefined {
  if (field === "delay") return override.latency && (delayOf(override.latency)?.base ?? 0);
  return override.errorRate === undefined ? undefined : Math.round(override.errorRate * 100);
}

/**
 * A route override's delay, error rate, faults, size limit and types of
 * file, each the route's own or the global one. Setting one makes it the
 * route's own and switches the override on; the others stay as they were.
 * A setting's reset — or `Global`, or an empty field — takes it back to the
 * global one, and the last one taken back switches the override off.
 * Faults given to a route that nothing would fail come with a rate of 100%.
 *
 * @param props - The route's override, the global settings, and what follows a settled change
 * @returns The editor
 * @example
 * ```tsx
 * <RouteOverrideEditor override={row.override} global={{ delay: 600, rate: 40 }} onCommit={send} />
 * ```
 */
export function RouteOverrideEditor({
  override,
  global,
  onCommit,
}: RouteOverrideEditorProps): React.ReactNode {
  const [draft, setDraft] = useState<{ field: OverrideField; value: number } | null>(null);
  const settle = (field: OverrideField, value: number): void => {
    setDraft(null);
    onCommit(withOwnField(override, field, value));
  };
  const owned = setsAnything(override);
  return (
    <div className="flex flex-col gap-3.5 border-b border-line bg-bg-subtle px-4.5 py-3.5 pl-[74px]">
      {FIELDS.map((f) => {
        const own = draft?.field === f.field ? draft.value : ownValue(override, f.field);
        const value = own ?? (f.field === "delay" ? global.delay : global.rate);
        return (
          <div
            key={f.field}
            className="grid grid-cols-[72px_minmax(0,1fr)_56px_24px] items-center gap-3"
          >
            <span className="text-small text-fg-subtle">{f.label}</span>
            <RangeSlider
              label={f.name}
              tone={f.tone}
              value={value}
              max={f.max}
              step={f.step}
              onChange={(next) => setDraft({ field: f.field, value: next })}
              onCommit={(next) => settle(f.field, next)}
            />
            <span
              className={cn(
                "text-right font-mono text-small",
                own === undefined && "text-fg-subtle",
              )}
            >
              {own === undefined ? "global" : f.format(own)}
            </span>
            {own !== undefined && (
              <button
                type="button"
                aria-label={`Use the global ${f.label.toLowerCase()}`}
                title={`Use the global ${f.label.toLowerCase()}`}
                onClick={() => onCommit(withGlobalField(override, f.field))}
                className="flex size-6 cursor-pointer items-center justify-center rounded-[6px] text-fg-subtle hover:bg-raised hover:text-fg"
              >
                <RotateCcw aria-hidden="true" className="size-3" />
              </button>
            )}
          </div>
        );
      })}
      <RouteFaultsRow
        faults={override.faultTypes ?? []}
        onFaults={(faults) => onCommit(withFaults(override, faults, global.rate / 100))}
      />
      <RouteUploadRows override={override} onCommit={onCommit} />
      {owned && (
        <button
          type="button"
          onClick={() => onCommit({ routeId: override.routeId, enabled: false })}
          className="flex h-6.5 cursor-pointer items-center gap-1.5 self-start rounded-[6px] px-2 text-small text-fg-subtle hover:bg-raised hover:text-fg"
        >
          <RotateCcw aria-hidden="true" className="size-3" />
          Use the global settings
        </button>
      )}
    </div>
  );
}
