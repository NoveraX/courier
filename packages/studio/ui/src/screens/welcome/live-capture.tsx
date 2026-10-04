import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import { CaptureIdle } from "./capture-idle";
import { CaptureStream } from "./capture-stream";

/**
 * The panel beside the setup that shows what Studio captures: its own log
 * until the first request, then the requests as they come — `streaming`
 * while an app is attached and recording, `paused` while recording is
 * paused, `offline` while Studio cannot be reached.
 *
 * @returns The panel
 * @example
 * ```tsx
 * <LiveCapture />
 * ```
 */
export function LiveCapture(): React.ReactNode {
  const hasRequests = useStudioStore((s) => s.requests.length > 0);
  const status = useStudioStore((s) => s.connectionStatus);
  const attached = useStudioStore((s) => s.bindingSnapshot.runtimeCount > 0);
  const paused = useStudioStore((s) => s.paused);
  const offline = status === "disconnected" || status === "reconnecting";
  const state = offline ? "offline" : paused ? "paused" : attached ? "streaming" : "idle";
  return (
    <section
      aria-label="Live capture"
      className="sticky top-6 mb-6 flex min-w-0 flex-col overflow-hidden rounded-dialog border border-line bg-panel max-[1180px]:static"
    >
      <div className="flex h-11 items-center gap-2.5 border-b border-line px-3.5">
        <span className="font-semibold">Live capture</span>
        <span className="flex-1" />
        <span
          className={cn(
            "flex h-5.5 items-center gap-1.5 rounded-full px-2 font-mono text-meta tracking-[0.04em]",
            state === "streaming" && "bg-ok-dim text-ok",
            state === "paused" && "bg-warn-dim text-warn",
            state === "offline" && "bg-err-dim text-err",
            state === "idle" && "bg-raised text-fg-subtle",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-1.25 rounded-full bg-current",
              state === "streaming" && "animate-pulse-live",
            )}
          />
          {state}
        </span>
      </div>
      {hasRequests ? <CaptureStream /> : <CaptureIdle />}
    </section>
  );
}
