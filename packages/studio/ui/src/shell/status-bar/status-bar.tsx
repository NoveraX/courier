import { cn } from "@/lib/utils";
import { ConnectionSegment } from "./connection-segment";
import { studioPort } from "./studio-port";
import { TrafficSegment } from "./traffic-segment";
import { useWatchState } from "./watch-state";

/* The files Studio watches, or that a mock reloads after an edit. */
function WatchSegment(): React.ReactNode {
  const watch = useWatchState();
  if (!watch) return null;
  return (
    <div
      className={cn(
        "flex items-center border-l border-line px-3 max-sm:hidden",
        watch.reloading && "text-warn",
      )}
    >
      {watch.label}
    </div>
  );
}

/**
 * The bar under every view: the connection, the files watched, the
 * traffic, and the port Studio serves on — clear of a phone's home
 * indicator and its rounded corners. A phone keeps the connection and the
 * counts of requests and errors; the rest is in the navigation drawer's
 * status.
 *
 * @returns The status bar
 * @example
 * ```tsx
 * <StatusBar />
 * ```
 */
export function StatusBar(): React.ReactNode {
  return (
    <footer className="col-span-full row-start-2 flex items-stretch overflow-hidden border-t border-line bg-inset pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] font-mono text-meta whitespace-nowrap text-fg-subtle tabular-nums select-none">
      <ConnectionSegment />
      <WatchSegment />
      <TrafficSegment />
      <div className="flex items-center border-l border-line px-3 opacity-70 max-sm:hidden">
        studio :{studioPort(window.location)}
      </div>
    </footer>
  );
}
