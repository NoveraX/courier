import { Button } from "@/components/ui/button";
import { useTimeReached } from "./use-time-reached";

interface ApplyButtonProps {
  label: string;
  /** Epoch milliseconds from which a click applies the plan. */
  armedAt: number;
  className: string;
  onApply: () => void;
}

/**
 * The button that applies a ready plan. It turns on only once the plan has
 * been on screen for a moment: the plan appears within milliseconds of the
 * click that asked for it, where that button was, and the second click of a
 * double click must not write a change nobody has seen.
 *
 * @param props - The button's label, when it turns on, its classes, and what a click does
 * @returns The button
 *
 * @example
 * ```tsx
 * <ApplyButton label="Add to courier.mocks.ts" armedAt={plan.armedAt} className={PRIMARY} onApply={() => session.apply()} />
 * ```
 */
export function ApplyButton({
  label,
  armedAt,
  className,
  onApply,
}: ApplyButtonProps): React.ReactElement {
  const armed = useTimeReached(armedAt);
  return (
    <Button type="button" size="sm" className={className} disabled={!armed} onClick={onApply}>
      {label}
    </Button>
  );
}
