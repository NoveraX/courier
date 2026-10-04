import { Button } from "@/design/button";
import { Dot } from "@/design/dot";
import { useBackToLive } from "@/hooks/use-back-to-live";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";

type RecordingState = "recording" | "paused" | "idle" | "offline";

const LABEL: Readonly<Record<RecordingState, string>> = {
  recording: "REC",
  paused: "PAUSED",
  idle: "OFFLINE",
  offline: "OFFLINE",
};

const TONE: Readonly<Record<RecordingState, string>> = {
  recording: "text-err hover:text-err",
  paused: "text-warn hover:text-warn",
  idle: "text-fg-subtle",
  offline: "text-fg-subtle",
};

interface RecordingButtonProps {
  /** Leave the button out while there is nothing to record or resume. */
  hideIdle?: boolean;
}

/**
 * Whether Studio records: `REC` pulsing while an app is attached and its
 * requests are recorded, `PAUSED` while they are not — or while a saved
 * session is shown in place of the live requests — and `OFFLINE` while no
 * app is attached or Studio cannot be reached. A click pauses or resumes,
 * or goes back to the live requests.
 *
 * @param props - Whether to leave it out while nothing is recorded
 * @returns The button, or nothing while it is left out
 * @example
 * ```tsx
 * <RecordingButton hideIdle={onSetupPage} />
 * ```
 */
export function RecordingButton({ hideIdle = false }: RecordingButtonProps): React.ReactNode {
  const paused = useStudioStore((s) => s.paused);
  const connected = useStudioStore((s) => s.connected);
  const attached = useStudioStore((s) => s.bindingSnapshot.runtimeCount > 0);
  const session = useStudioStore((s) => s.shownSession);
  const togglePaused = useStudioStore((s) => s.togglePaused);
  const backToLive = useBackToLive();
  const state: RecordingState =
    paused || session ? "paused" : !connected ? "offline" : attached ? "recording" : "idle";
  if (hideIdle && (state === "idle" || state === "offline")) return null;
  const title = session
    ? `Showing the saved session ${session.name} · back to live requests`
    : {
        recording: "Pause recording",
        paused: "Resume recording",
        idle: "Pause recording · no app is attached yet",
        offline: "Studio cannot be reached",
      }[state];
  return (
    <Button
      onClick={session ? backToLive : togglePaused}
      title={title}
      aria-label={title}
      className={cn("gap-1.5 font-mono text-meta tracking-caps", TONE[state])}
    >
      <Dot tone="current" square={state === "paused"} pulse={state === "recording"} />
      {LABEL[state]}
    </Button>
  );
}
