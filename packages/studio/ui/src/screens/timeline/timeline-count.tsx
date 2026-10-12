import { Pin } from "lucide-react";

import { Skeleton } from "@/design/skeleton";
import { useFirstLoad } from "@/hooks/use-first-load";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";

/**
 * How many requests the Timeline shows of all it holds, after how many are
 * pinned while any is. The bar over the Timeline shows it; on a phone it
 * ends the row of filters instead.
 *
 * @param props - How many requests show, and classes for where it sits
 * @returns The counts
 * @example
 * ```tsx
 * <TimelineCount shown={12} />
 * ```
 */
export function TimelineCount({
  shown,
  className,
}: {
  shown: number;
  className?: string | undefined;
}): React.ReactNode {
  const total = useStudioStore((s) => s.requests.length);
  const pinned = useStudioStore((s) => s.requests.filter((r) => r.pinned).length);
  const loading = useFirstLoad();
  return (
    <span className={cn("flex shrink-0 items-center gap-2", className)}>
      {pinned > 0 && (
        <span className="flex h-5.5 items-center gap-1.25 rounded-full bg-syntax-keyword/12 px-2 text-label font-strong text-syntax-keyword">
          <Pin aria-hidden="true" className="size-2.75" />
          {pinned}
        </span>
      )}
      {loading.requests ? (
        <Skeleton className="h-3 w-20" />
      ) : (
        <span className="text-control whitespace-nowrap text-fg-subtle tabular-nums">
          {shown === total ? (
            <>
              <span className="font-strong text-fg">{total}</span> requests
            </>
          ) : (
            <>
              <span className="font-strong text-fg">{shown}</span> of {total} requests
            </>
          )}
        </span>
      )}
    </span>
  );
}
