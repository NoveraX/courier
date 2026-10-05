import { toast } from "sonner";

import type { SegmentedOption } from "@/design/segmented";
import { Segmented } from "@/design/segmented";
import type { PairPreset } from "@/features/compare/compare-pairs";

const PRESETS: readonly SegmentedOption<PairPreset | "own">[] = [
  { value: "failure", label: "Success vs failure" },
  { value: "slow", label: "Fast vs slow" },
  { value: "latest", label: "Latest two" },
];

interface CompareHeaderProps {
  /** The ready-made pair shown, `null` for one picked by hand, `undefined` while there is no pair. */
  preset: PairPreset | null | undefined;
  /** Shows a ready-made pair; `false` when the traffic has none. */
  onPreset: (preset: PairPreset) => boolean;
}

/**
 * Compare's head: what the page does, and the ready-made pairs — a success
 * against a failure, the fastest against the slowest, the newest two.
 *
 * @param props - The pair shown, and what shows a ready-made one
 * @returns The header
 * @example
 * ```tsx
 * <CompareHeader preset="failure" onPreset={model.applyPreset} />
 * ```
 */
export function CompareHeader({ preset, onPreset }: CompareHeaderProps): React.ReactNode {
  const choose = (value: PairPreset | "own"): void => {
    if (value !== "own" && !onPreset(value)) toast.info("No matching pair in this session yet");
  };
  return (
    <header className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="m-0 text-page font-semibold tracking-[-0.025em]">Compare</h1>
        <span className="text-control text-fg-subtle">Diff two captured requests side by side</span>
      </div>
      <div className="flex-1" />
      {preset !== undefined && (
        <Segmented
          label="Ready-made pairs"
          options={PRESETS}
          value={preset ?? "own"}
          onChange={choose}
        />
      )}
    </header>
  );
}
