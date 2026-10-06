import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import { useMockStore } from "@/store/mock-slice";
import { ConnectionSegment } from "./connection-segment";
import { TrafficSegment } from "./traffic-segment";

/* The files Studio watches, or that a mock reloads after an edit. */
function WatchSegment(): React.ReactNode {
  const watched = useStudioStore((s) => s.watcherApiPaths);
  const reloading = useMockStore((s) =>
    Object.values(s.servers).some((server) => server.processStatus === "restarting"),
  );
  if (watched === 0 && !reloading) return null;
  return (
    <div className={cn("flex items-center border-l border-line px-3", reloading && "text-warn")}>
      {reloading ? "reloading…" : `watching ${watched}`}
    </div>
  );
}

/**
 * The bar under every view: the connection, the files watched, the
 * traffic, and the port Studio serves on.
 *
 * @returns The status bar
 * @example
 * ```tsx
 * <StatusBar />
 * ```
 */
export function StatusBar(): React.ReactNode {
  const port = window.location.port || (window.location.protocol === "https:" ? "443" : "80");
  return (
    <footer className="col-span-full row-start-2 flex items-stretch overflow-hidden border-t border-line bg-inset font-mono text-meta whitespace-nowrap text-fg-subtle tabular-nums select-none">
      <ConnectionSegment />
      <WatchSegment />
      <TrafficSegment />
      <div className="flex items-center border-l border-line px-3 opacity-70">studio :{port}</div>
    </footer>
  );
}
