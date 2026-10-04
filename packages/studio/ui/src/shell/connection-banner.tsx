import { Button } from "@/design/button";
import { Dot } from "@/design/dot";
import { getSocket } from "@/socket";
import { useStudioStore } from "@/store";

/**
 * Says that Studio cannot be reached — the page's first connection aside,
 * which settles in a moment — with the attempt under way and a way to try
 * again at once.
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
  if (status === "connected" || status === "connecting") return null;
  return (
    <div
      role="alert"
      className="flex shrink-0 animate-pop-in items-center gap-3 border-b border-err/30 bg-err-dim px-5 py-2.25 text-control"
    >
      <Dot tone="err" className="size-1.75" />
      <span className="text-fg">
        <strong className="font-semibold">Studio cannot be reached.</strong>{" "}
        <span className="text-fg-muted">Captured requests stay on this page.</span>
      </span>
      <span className="flex-1" />
      {status === "reconnecting" && (
        <span className="font-mono text-badge text-fg-muted">attempt {attempt}</span>
      )}
      <Button variant="danger" className="h-6.5 text-small" onClick={() => getSocket().connect()}>
        Reconnect now
      </Button>
    </div>
  );
}
