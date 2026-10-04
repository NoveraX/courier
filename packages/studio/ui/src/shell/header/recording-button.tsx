import { Button } from "@/design/button";
import { Dot } from "@/design/dot";
import { useBackToLive } from "@/hooks/use-back-to-live";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";

/**
 * Whether Studio records: `REC` pulsing while it does, `PAUSED` while it
 * does not — or while a saved session is shown in place of the live
 * requests — and `OFFLINE` while Studio cannot be reached. A click pauses
 * or resumes, or goes back to the live requests.
 *
 * @returns The button
 * @example
 * ```tsx
 * <RecordingButton />
 * ```
 */
export function RecordingButton(): React.ReactNode {
  const paused = useStudioStore((s) => s.paused);
  const connected = useStudioStore((s) => s.connected);
  const session = useStudioStore((s) => s.shownSession);
  const togglePaused = useStudioStore((s) => s.togglePaused);
  const backToLive = useBackToLive();
  const state = paused || session ? "paused" : connected ? "recording" : "offline";
  const label = { paused: "PAUSED", recording: "REC", offline: "OFFLINE" }[state];
  const title = session
    ? `Showing the saved session ${session.name} · back to live requests`
    : paused
      ? "Resume recording"
      : connected
        ? "Pause recording"
        : "Studio cannot be reached";
  return (
    <Button
      onClick={session ? backToLive : togglePaused}
      title={title}
      aria-label={title}
      className={cn(
        "gap-1.5 font-mono text-meta tracking-caps",
        state === "paused" && "text-warn hover:text-warn",
        state === "recording" && "text-err hover:text-err",
        state === "offline" && "text-fg-subtle",
      )}
    >
      <Dot tone="current" square={state === "paused"} pulse={state === "recording"} />
      {label}
    </Button>
  );
}
