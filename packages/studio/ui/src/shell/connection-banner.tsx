import { Button } from "@/design/button";
import { Dot } from "@/design/dot";
import { cn } from "@/lib/utils";
import { getSocket } from "@/socket";
import { useStudioStore } from "@/store";

/* A demo that drops within this long of its reset is taken to be resetting. */
const RESET_MARGIN_MS = 60_000;

/**
 * Says that Studio cannot be reached — the page's first connection aside,
 * which settles in a moment — with the attempt under way and a way to try
 * again at once. A public demo that drops when it is due to reset says it
 * is resetting rather than that something failed.
 *
 * @returns The banner, or nothing while Studio answers
 * @example
 * ```tsx
 * <ConnectionBanner />
 * ```
 */
export function ConnectionBanner(): React.ReactNode {
  const status = useStudioStore((s) => s.connectionStatus);
  const attempt = useStudioStore((s) => s.reconnectAttempt);
  const resetsAt = useStudioStore((s) => s.studioInfo?.demo?.resetsAt);
  if (status === "connected" || status === "connecting") return null;
  const resetting = resetsAt !== undefined && Date.now() >= resetsAt - RESET_MARGIN_MS;
  return (
    <div
      role="alert"
      className={cn(
        "flex shrink-0 animate-pop-in items-center gap-3 border-b px-5 py-2.25 text-control",
        resetting ? "border-brand/20 bg-brand-dim" : "border-err/30 bg-err-dim",
      )}
    >
      <Dot tone={resetting ? "brand" : "err"} pulse={resetting} className="size-1.75" />
      {resetting ? (
        <span className="text-fg">
          <strong className="font-semibold">The demo is resetting.</strong>{" "}
          <span className="text-fg-muted">It is back in a few seconds, as it started.</span>
        </span>
      ) : (
        <span className="text-fg">
          <strong className="font-semibold">Studio cannot be reached.</strong>{" "}
          <span className="text-fg-muted">Captured requests stay on this page.</span>
        </span>
      )}
      <span className="flex-1" />
      {status === "reconnecting" && (
        <span className="font-mono text-badge text-fg-muted">attempt {attempt}</span>
      )}
      <Button
        variant={resetting ? "outline" : "danger"}
        className="h-6.5 text-small"
        onClick={() => getSocket().connect()}
      >
        Reconnect now
      </Button>
    </div>
  );
}
