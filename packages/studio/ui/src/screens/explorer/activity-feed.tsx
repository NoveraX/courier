import { CardSection } from "@/design/card-section";
import { shortAgo } from "@/features/explorer/endpoint-key";
import { methodLabelOf } from "@/features/explorer/method-label";
import { durationTone } from "@/features/requests/duration-tone";
import { codeLabel, httpMethodOf } from "@/features/requests/request-parts";
import { isFailedState, isStreamRequest, requestStateOf } from "@/features/requests/request-state";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { SharedChip } from "@/screens/timeline/shared-chip";
import type { RequestEntry } from "@/store/types";
import { EndpointName } from "./endpoint-name";
import { methodClassOf } from "./method-class";

/* How many of the newest calls the feed lists. */
const FEED_SIZE = 14;

const DURATION_TEXT = { normal: "text-fg-muted", warn: "text-warn", err: "text-err" } as const;

interface ActivityRowProps {
  request: RequestEntry;
  now: number;
  slowMs: number;
  onOpen: (id: string) => void;
}

function ActivityRow({ request: r, now, slowMs, onOpen }: ActivityRowProps): React.ReactNode {
  const state = requestStateOf(r);
  const stream = isStreamRequest(r);
  const method = methodLabelOf({ transport: r.transport ?? "http", httpMethod: httpMethodOf(r) });
  const total = r.timing?.total;
  const duration = stream
    ? state === "streaming"
      ? "live"
      : "closed"
    : state === "pending" || total === undefined
      ? "···"
      : formatDuration(total);
  return (
    <button
      type="button"
      onClick={() => onOpen(r.id)}
      className="grid h-8 shrink-0 cursor-pointer grid-cols-[58px_40px_minmax(0,1fr)_44px_60px] items-center gap-2.5 rounded-control px-2.5 text-left font-mono text-label tabular-nums hover:bg-raised focus-visible:outline-2 focus-visible:outline-brand max-sm:grid-cols-[30px_38px_minmax(0,1fr)_30px_48px] max-sm:gap-2 pointer-coarse:h-11"
    >
      <span className="text-fg-subtle">{shortAgo(now - r.startedAt)}</span>
      <span className={cn("text-micro font-semibold", methodClassOf(method))}>{method}</span>
      <span className="flex min-w-0 items-center gap-1.5">
        <EndpointName source={r.source} group={r.group ?? ""} method={r.method} />
        {r.shared && <SharedChip shared={r.shared} />}
      </span>
      <span
        className={cn(
          isFailedState(state) ? "text-err" : state === "pending" ? "text-warn" : "text-ok",
          state === "aborted" && "text-fg-subtle",
        )}
      >
        {stream ? "—" : codeLabel(r, state)}
      </span>
      <span
        className={cn(
          "text-right",
          stream || total === undefined ? "text-brand" : DURATION_TEXT[durationTone(total, slowMs)],
        )}
      >
        {duration}
      </span>
    </button>
  );
}

interface ActivityFeedProps {
  requests: readonly RequestEntry[];
  now: number;
  slowMs: number;
  /** Whether Studio records an attached app now. */
  live: boolean;
  onOpen: (id: string) => void;
}

/**
 * The newest calls as they come in — when, how each went, which endpoint,
 * marked where another call's request answered it, its status and
 * duration — each opening in the inspector. On a phone the columns close
 * up around the endpoint's name.
 *
 * @param props - The requests, the time now, the slow threshold, whether Studio records, and what opens a call
 * @returns The card
 * @example
 * ```tsx
 * <ActivityFeed requests={requests} now={now} slowMs={500} live onOpen={open} />
 * ```
 */
export function ActivityFeed(props: ActivityFeedProps): React.ReactNode {
  const { requests, now, slowMs, live, onOpen } = props;
  const latest = requests.slice(0, FEED_SIZE);
  return (
    <CardSection
      title="Activity"
      aside={live && <span className="flex items-center gap-1.5 text-label text-brand">live</span>}
    >
      <div className="flex max-h-105 flex-col overflow-auto p-1.5">
        {latest.length === 0 && (
          <p className="px-2.5 py-8 text-center text-control text-fg-subtle">No calls yet</p>
        )}
        {latest.map((request) => (
          <ActivityRow
            key={request.id}
            request={request}
            now={now}
            slowMs={slowMs}
            onOpen={onOpen}
          />
        ))}
      </div>
    </CardSection>
  );
}
