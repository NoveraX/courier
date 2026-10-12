import { useId } from "react";

import type { ChaosMode } from "@/features/mocks/chaos-config";
import { PRESET_CONFIG } from "@/features/mocks/chaos-config";
import { cn } from "@/lib/utils";
import { CHAOS_LOOK } from "./chaos-look";

const MODES: readonly ChaosMode[] = ["stable", "degraded", "unstable", "down", "custom"];

interface ChaosCardsProps {
  mode: ChaosMode;
  /** The rate in force, in percent, which the Custom card shows. */
  customRate: number;
  disabled: boolean;
  onPick: (mode: ChaosMode) => void;
}

/**
 * The chaos modes as cards — Stable, Degraded, Unstable, Down and Custom —
 * each with what it does and the share of answers it fails; the one in
 * force is drawn in its colour. They are a radio group, so the arrow keys
 * move between them.
 *
 * @param props - The mode in force, the custom rate, whether the mock can take a change, and what picking does
 * @returns The cards
 * @example
 * ```tsx
 * <ChaosCards mode="stable" customRate={30} disabled={false} onPick={pick} />
 * ```
 */
export function ChaosCards({
  mode,
  customRate,
  disabled,
  onPick,
}: ChaosCardsProps): React.ReactNode {
  const name = useId();
  return (
    <fieldset
      aria-label="Chaos"
      disabled={disabled}
      className="m-0 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(118px,100%),1fr))] gap-2.5 border-0 p-0"
    >
      {MODES.map((card) => {
        const look = CHAOS_LOOK[card];
        const on = card === mode;
        const rate = card === "custom" ? customRate : PRESET_CONFIG[card].errorRate;
        return (
          <label
            key={card}
            className={cn(
              "flex cursor-pointer flex-col items-start gap-2.5 rounded-[13px] border p-3.5 transition-[border-color,box-shadow] duration-150 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand has-disabled:cursor-default has-disabled:opacity-50",
              look.tone,
              on
                ? "border-current bg-[color-mix(in_srgb,currentColor_7%,var(--color-panel))] shadow-[0_0_0_3px_color-mix(in_srgb,currentColor_12%,transparent)]"
                : "border-line bg-panel hover:border-line-strong",
            )}
          >
            <input
              type="radio"
              name={name}
              value={card}
              checked={on}
              onChange={() => onPick(card)}
              className="sr-only"
            />
            <span className="flex w-full items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-card bg-[color-mix(in_srgb,currentColor_14%,transparent)]">
                <look.icon aria-hidden="true" className="size-3.25" />
              </span>
              <span className="flex-1" />
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded-full border-[1.5px]",
                  on ? "border-current" : "border-line-strong",
                )}
              >
                {on && <span className="size-2 rounded-full bg-current" />}
              </span>
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-ui font-semibold text-fg">{look.label}</span>
              <span className="text-label leading-[1.4] text-fg-subtle">{look.sub}</span>
            </span>
            <span className="flex w-full items-center gap-2">
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-raised">
                <span className="block h-full bg-current" style={{ width: `${rate}%` }} />
              </span>
              <span className="font-mono text-meta text-fg-subtle">{rate}%</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
