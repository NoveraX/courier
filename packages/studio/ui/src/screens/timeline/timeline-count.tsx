import { Pin } from "lucide-react";

import { Skeleton } from "@/design/skeleton";
import { sentOwnRequest } from "@/features/requests/own-requests";
import { useFirstLoad } from "@/hooks/use-first-load";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";

/**
 * How many calls the Timeline shows of all it holds, after how many are
 * pinned while any is — as requests while every call sent its own, and as
 * calls and the requests they sent once another call's request answered
 * some. The bar over the Timeline shows it; on a phone it ends the row of
 * filters instead.
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
  const sent = useStudioStore((s) => s.requests.filter(sentOwnRequest).length);
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
          <span className="font-strong text-fg">{shown}</span>
          {countText(shown, total, sent)}
        </span>
      )}
    </span>
  );
}

/* What follows the count shown: of how many, and — once some calls sent no request of their own — that they are calls, and the requests they sent. */
function countText(shown: number, total: number, sent: number): string {
  const word = sent === total ? "requests" : "calls";
  if (shown !== total) return ` of ${total} ${word}`;
  return sent === total ? " requests" : ` calls · ${sent} ${sent === 1 ? "request" : "requests"}`;
}
