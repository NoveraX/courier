import { attachedApps } from "@/features/runtimes/attached-apps";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import type { CaptureLogLine } from "./capture-log";
import { captureLog } from "./capture-log";

const TAG_TONE: Readonly<Record<CaptureLogLine["tag"], string>> = {
  studio: "text-brand",
  config: "text-syntax-type",
  watch: "text-ok",
  runtime: "text-syntax-keyword",
};

const pad = (n: number): string => String(n).padStart(2, "0");
const clock = (at: number): string => {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/* Placeholder rows, fading out, for the requests to come. */
const GHOSTS = [
  { opacity: 1, width: "72%" },
  { opacity: 0.8, width: "54%" },
  { opacity: 0.62, width: "86%" },
  { opacity: 0.46, width: "40%" },
  { opacity: 0.32, width: "64%" },
  { opacity: 0.2, width: "50%" },
];

/**
 * The capture panel before the first request: Studio's own log, and rows
 * where the requests will appear.
 *
 * @returns The panel's body
 * @example
 * ```tsx
 * <CaptureIdle />
 * ```
 */
export function CaptureIdle(): React.ReactNode {
  const startedAt = useStudioStore((s) => s.studioInfo?.startedAt);
  const snapshot = useStudioStore((s) => s.bindingSnapshot);
  const config = useStudioStore((s) => s.configStatus);
  const watched = useStudioStore((s) => s.watcherApiPaths);
  const watchedSince = useStudioStore((s) => s.watcherSince ?? undefined);
  const lines = captureLog({
    host: window.location.host,
    startedAt,
    config,
    watched,
    watchedSince,
    apps: attachedApps(snapshot),
    attachedSince: snapshot.activeSince,
    idleSince: snapshot.idleSince,
  });
  return (
    <div className="flex flex-col">
      <div className="min-h-39 border-b border-line bg-inset px-4 py-3.5 font-mono text-label leading-[1.85]">
        {lines.map((line) => (
          <div
            key={`${line.tag}:${line.message}`}
            className="flex gap-2.5 overflow-hidden whitespace-nowrap"
          >
            <span className="w-15 shrink-0 text-fg-subtle opacity-70">
              {line.at ? clock(line.at) : ""}
            </span>
            <span className={cn("w-15.5 shrink-0", TAG_TONE[line.tag])}>{line.tag}</span>
            <span className="truncate text-fg-muted">{line.message}</span>
          </div>
        ))}
        <span aria-hidden="true" className="mt-0.75 block h-3.75 w-2 animate-caret bg-brand" />
      </div>
      <div className="flex flex-col gap-2.25 px-4 pt-4.5 pb-5">
        {GHOSTS.map((ghost) => (
          <div
            key={ghost.width}
            aria-hidden="true"
            style={{ opacity: ghost.opacity }}
            className="grid grid-cols-[70px_44px_minmax(0,1fr)_52px] items-center gap-3"
          >
            <span className="h-1.75 rounded-[3px] bg-raised" />
            <span className="h-1.75 rounded-[3px] bg-raised" />
            <span className="h-1.75 rounded-[3px] bg-raised" style={{ width: ghost.width }} />
            <span className="h-1.75 rounded-[3px] bg-raised" />
          </div>
        ))}
        <p className="mt-2.5 text-control leading-normal text-fg-subtle">
          Requests stream in here the moment your app makes its first call.
        </p>
      </div>
    </div>
  );
}
