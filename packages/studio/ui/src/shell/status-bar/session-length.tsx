import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import { sessionClock } from "../session-clock";

interface SessionLengthProps {
  /** When the session began, in epoch milliseconds. */
  since: number;
  className?: string | undefined;
}

/**
 * How long the session has run, ticking while a runtime is attached.
 *
 * @param props - When the session began, and classes to add
 * @returns The clock
 * @example
 * ```tsx
 * <SessionLength since={sessionStartedAt} />
 * ```
 */
export function SessionLength({ since, className }: SessionLengthProps): React.ReactNode {
  const tick = useStudioStore((s) => s.clientTick);
  return (
    <span className={cn("opacity-65", className)}>
      {sessionClock(tick >= 0 ? Date.now() - since : 0)}
    </span>
  );
}
