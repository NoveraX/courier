import { X } from "lucide-react";

import { RangeSlider } from "@/design/range-slider";
import { faultLook } from "@/features/mocks/fault-catalogue";
import { cn } from "@/lib/utils";

interface FaultMixRowProps {
  type: string;
  weight: number;
  /** Its share of the failures, in percent. */
  share: number;
  /** Whether it may be taken out of the mix: the last one may not. */
  removable: boolean;
  onWeight: (weight: number) => void;
  onWeightSettled: (weight: number) => void;
  onRemove: () => void;
}

/**
 * A fault in the mix: its fill in the mix's bar, its name and what it does,
 * its weight against the others and its share of the failures, and a way
 * to take it out of the mix.
 *
 * @param props - The fault, its weight and share, and what moving and removing it do
 * @returns The row
 * @example
 * ```tsx
 * <FaultMixRow type="413" weight={20} share={25} removable onWeight={show} onWeightSettled={send} onRemove={drop} />
 * ```
 */
export function FaultMixRow(props: FaultMixRowProps): React.ReactNode {
  const { type, weight, share, removable, onWeight, onWeightSettled, onRemove } = props;
  const look = faultLook(type);
  return (
    <div className="grid min-h-11.5 grid-cols-[minmax(0,1fr)_minmax(90px,1.2fr)_40px_24px] items-center gap-3 border-b border-line pr-2 pl-3.5 last:border-b-0">
      <span className="flex min-w-0 items-center gap-2.25">
        <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-[2px]", look.fill)} />
        <span className="flex min-w-0 flex-col gap-px">
          <span className="font-mono text-small font-medium">{look.label}</span>
          <span className="truncate text-badge text-fg-subtle">{look.sub}</span>
        </span>
      </span>
      <RangeSlider
        size="sm"
        fill={look.fill}
        label={`Weight of ${look.label}`}
        value={weight}
        max={100}
        onChange={onWeight}
        onCommit={onWeightSettled}
      />
      <span className="text-right font-mono text-small text-fg-muted">{share}%</span>
      {removable ? (
        <button
          type="button"
          aria-label={`Take ${look.label} out of the mix`}
          title="Take it out of the mix"
          onClick={onRemove}
          className="hit-area relative flex size-6 cursor-pointer items-center justify-center rounded-[6px] text-fg-subtle hover:bg-raised hover:text-fg"
        >
          <X aria-hidden="true" className="size-3" />
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}
