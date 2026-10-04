import { ArrowUp, Pin, Radio } from "lucide-react";

import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";

/**
 * The head of a group of rows: the pinned requests, or the live ones.
 *
 * @param props - The group, and how many rows it holds
 * @returns The head
 * @example
 * ```tsx
 * <GroupHead label="Pinned" count={2} />
 * ```
 */
export function GroupHead({
  label,
  count,
}: {
  label: "Pinned" | "Live";
  count: number;
}): React.ReactNode {
  const Icon = label === "Pinned" ? Pin : Radio;
  return (
    <div
      className={cn(
        "flex h-7 items-center gap-2 border-b border-line bg-bg-subtle px-5 text-label font-strong",
        label === "Pinned" ? "text-syntax-keyword" : "text-fg-muted",
      )}
    >
      <Icon aria-hidden="true" className="size-3" />
      {label}
      <span className="font-normal text-fg-subtle tabular-nums">{count}</span>
    </div>
  );
}

/**
 * While recording is paused, the requests held meanwhile: a click resumes
 * recording and shows them.
 *
 * @returns The pill, or nothing while none is held
 * @example
 * ```tsx
 * <HeldPill />
 * ```
 */
export function HeldPill(): React.ReactNode {
  const held = useStudioStore((s) => (s.paused ? s.heldRequests.length : 0));
  const resume = useStudioStore((s) => s.togglePaused);
  if (held === 0) return null;
  return (
    <button
      type="button"
      onClick={resume}
      className="absolute top-10 left-1/2 z-5 flex h-7 -translate-x-1/2 animate-pop-in cursor-pointer items-center gap-1.75 rounded-full bg-brand px-3 text-small font-semibold text-bg shadow-[0_6px_20px_-6px_rgb(0_0_0/0.5)]"
    >
      <ArrowUp aria-hidden="true" className="size-3" />
      {held} new · resume
    </button>
  );
}
