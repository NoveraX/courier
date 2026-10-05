import { RotateCcw } from "lucide-react";
import { useState } from "react";

import { RangeSlider } from "@/design/range-slider";
import { delayOf } from "@/features/mocks/latency-window";
import type { RouteOverride } from "@/store/mock-slice";

interface RouteOverrideEditorProps {
  override: RouteOverride;
  /** A slider let go, or the override cleared: the override to send. */
  onCommit: (override: RouteOverride) => void;
}

/**
 * A route override's delay and failure rate as sliders. Setting either
 * switches the override on; Reset clears it back to the global settings.
 *
 * @param props - The route's override, and what follows a settled change
 * @returns The editor
 * @example
 * ```tsx
 * <RouteOverrideEditor override={row.override} onCommit={(o) => setRouteOverride(server, o)} />
 * ```
 */
export function RouteOverrideEditor({
  override,
  onCommit,
}: RouteOverrideEditorProps): React.ReactNode {
  const [draft, setDraft] = useState<{ delay: number; rate: number } | null>(null);
  const shown = draft ?? {
    delay: delayOf(override.latency)?.base ?? 0,
    rate: Math.round((override.errorRate ?? 0) * 100),
  };
  const send = (next: { delay: number; rate: number }): void => {
    setDraft(null);
    onCommit({
      ...override,
      enabled: true,
      latency: { min: next.delay, max: next.delay, jitter: 0 },
      errorRate: next.rate / 100,
    });
  };
  const changed = shown.delay > 0 || shown.rate > 0;
  return (
    <div className="flex flex-col gap-3.5 border-b border-line bg-bg-subtle px-4.5 py-3.5 pl-[74px]">
      <div className="grid grid-cols-[72px_minmax(0,1fr)_56px] items-center gap-3">
        <span className="text-small text-fg-subtle">Delay</span>
        <RangeSlider
          label="Route delay"
          value={shown.delay}
          max={2_000}
          step={10}
          onChange={(delay) => setDraft({ ...shown, delay })}
          onCommit={(delay) => send({ ...shown, delay })}
        />
        <span className="text-right font-mono text-small">+{shown.delay}ms</span>
      </div>
      <div className="grid grid-cols-[72px_minmax(0,1fr)_56px] items-center gap-3">
        <span className="text-small text-fg-subtle">Error rate</span>
        <RangeSlider
          label="Route error rate"
          tone="risk"
          value={shown.rate}
          max={100}
          step={5}
          onChange={(rate) => setDraft({ ...shown, rate })}
          onCommit={(rate) => send({ ...shown, rate })}
        />
        <span className="text-right font-mono text-small">{shown.rate}%</span>
      </div>
      {changed && (
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
