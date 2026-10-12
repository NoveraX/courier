import { formatSize } from "@/lib/formatters";
import { useStudioStore } from "@/store";
import { StatusNotices } from "./status-notices";
import { countTraffic } from "./traffic-counts";

/**
 * The status bar's counts: requests and the bytes they brought, errors,
 * calls in flight, live streams, the ones dropped past the limit — and whatever Studio needs said
 * everywhere: a binding conflict, a config it cannot run, a saved session
 * shown, recording paused. A phone keeps the requests and the errors; the
 * bytes, the calls in flight and the streams are in the navigation
 * drawer's status.
 *
 * @returns The segment
 * @example
 * ```tsx
 * <TrafficSegment />
 * ```
 */
export function TrafficSegment(): React.ReactNode {
  const requests = useStudioStore((s) => s.requests);
  const { errors, pending, streams, bytes } = countTraffic(requests);
  return (
    <div className="flex flex-1 items-center gap-3.5 overflow-hidden border-l border-line px-3">
      <span>{requests.length} req</span>
      <span className="max-sm:hidden">{formatSize(bytes)}</span>
      {errors > 0 && <span className="text-err">{errors} err</span>}
      {pending > 0 && <span className="text-warn max-sm:hidden">{pending} pending</span>}
      {streams > 0 && (
        <span className="text-brand max-sm:hidden">
          {streams === 1 ? "1 stream" : `${streams} streams`}
        </span>
      )}
      <StatusNotices place="bar" />
    </div>
  );
}
